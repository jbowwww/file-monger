import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { inspect }  from "node:util";
import * as nodeCrypto from "node:crypto";
import { AspectParameters, PartiallyRequired, UniqueAspect, throttle as cache } from ".";
import { Progress } from "../progress";
import si from "systeminformation";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type Test<T> = (value: T) => boolean;
export const switchStream = <I extends {}>(iterable: Iterable<I>, ...tests: Test<I>[]): Array<Iterable<I>> => {
    const returns: I[][] = tests.map(test => []);
    for (const input of iterable) {
        returns[tests.findIndex(test => test(input))].push(input);
    }
    return returns;
};

export abstract class BlockDevice extends UniqueAspect {
    static ExpiryAgeMs = 15000;
    name: string;
    identifier: string;
    type: string;
    fsType: string;
    mount: string;
    size: number;
    physical: string;
    uuid: string;
    model: string;
    serial: string;
    removable: boolean;
    protocol: string;
    group?: string;
    device?: string;

    constructor(blockDevice: AspectParameters<BlockDevice>) {
        super(blockDevice);
        this.name = blockDevice.name;
        this.identifier = blockDevice.identifier;
        this.type = blockDevice.type;
        this.fsType = blockDevice.fsType;
        this.mount = blockDevice.mount;
        this.size = blockDevice.size;
        this.physical = blockDevice.physical;
        this.uuid = blockDevice.uuid;
        this.model = blockDevice.model;
        this.serial = blockDevice.serial;
        this.removable = blockDevice.removable;
        this.protocol = blockDevice.protocol;
        this.group = blockDevice.group;
        this.device = blockDevice.device;
    }

    static getAll = cache({
        expiryAgeMs: BlockDevice.ExpiryAgeMs,
    }, () => si.blockDevices() as Promise<AspectParameters<BlockDevice>[]>);
}

export type GetDiskForPathOptions = {
    path: string;
    disks?: Iterable<Disk>;
};

export class Disk extends BlockDevice {
    model: string;
    serial: string;

    constructor(disk: AspectParameters<Disk>) {
        super(disk);
        this.model = disk.model;
        this.serial = disk.serial;
    }

    get Query() {
        return ({
            byUnique: () => this.Query.byModelAndSerial(),
            byModelAndSerial: () => ({ "$and": [ { "Disk.model": { "$eq": this.model } }, { "Disk.serial": { "$eq": this.serial } } ] }),    
        });
    }
    static async getAll() {
        return BlockDevice.getAll().then(blockDevices => blockDevices
            .filter(bd => bd.type === "disk")
            .map(bd => new Disk(bd)));
    }

    static async getForPath(pathOrOptions: string | GetDiskForPathOptions) {
        const options: GetDiskForPathOptions = typeof pathOrOptions === "string" ? { path: pathOrOptions } : pathOrOptions;
        options.disks ??= await Disk.getAll();
        const partition = await Partition.getForPath({ path: options.path });
        const disk = Array.from(options.disks).filter(d => partition?.device?.startsWith(d.device ?? "")).at(0);
        return disk;
    };
}

export type GetPartitionForPathOptions = {
    path: string;
    partitions?: Iterable<Partition>;
};

export class Partition extends BlockDevice {
    uuid: string;

    constructor(partition: AspectParameters<Partition>) {
        super(partition);
        this.uuid = partition.uuid;
    }

    get Query() {
        return ({
            byUnique: () => this.Query.byUuid(),
            byUuid: () => ({ "Partition.uuid": { "$eq": this.uuid } }),
        });
    }

    static async getAll(): Promise<Partition[]> {
        return BlockDevice.getAll().then(blockDevices => blockDevices
            .filter(bd => bd.type === "part")
            .map(bd => new Partition(bd)));
    }

    static async getForPath(pathOrOptions: string | GetPartitionForPathOptions) {
        const options: GetPartitionForPathOptions = typeof pathOrOptions === "string" ? { path: pathOrOptions } : pathOrOptions;
        options.partitions ??= await Partition.getAll();

        const path = nodePath.resolve(options.path);
        const r = Array.from(options.partitions).filter(p => p.mount !== "" && path.startsWith(p.mount)).at(0);
        log(`getForPath("${inspect(pathOrOptions)}"): r = ${inspect(r)}`);
        return r;
    };
}

export abstract class Entry extends UniqueAspect {
    path: string;
    stats: nodeFs.Stats;
    partition?: Partition;

    constructor({ path, stats, partition }: AspectParameters<Entry>) {
        super();
        this.path = path;
        this.stats = stats;
        this.partition = partition;
    }

    get Query() {// AspectInstanceQueries<Entry> {
        return ({
            byUnique: () => this.Query.byPath(),
            byPath: () => ({ [`${this._T}.path`]: this.path, }),
        });
    }

    static async create({ path, stats, partition, partitions/* , drive, drives */ }: PartiallyRequired<Entry, "path"> & { partitions?: Iterable<Partition>; /* drives?: Iterable<Drive>; */ }) {
        path = nodePath.resolve(path);
        stats ??= await nodeFs.promises.stat(path);
        partition ??= (await Partition.getForPath({ partitions, path }));
        const entry = (
            stats.isFile() ? new File({ path, stats, partition }) :
            stats.isDirectory() ? new Directory({ path, stats, partition }) :
            new Unknown({ path, stats, partition }) );
        return entry as Entry;
    }
}

export class File extends Entry { constructor(file: AspectParameters<File>) { super({ ...file, }); }}
export class Directory extends Entry { constructor(directory: AspectParameters<Directory>) { super({ ...directory, }); }}
export class Unknown extends Entry { constructor(unknown: AspectParameters<Unknown>) { super({ ...unknown, }); }}

export type WalkCallbackFn = (entry: Entry, depth: number) => { emit: boolean, recurse?: boolean };
export const walk = async function *walk({
    path,
    maxDepth,
    callback = (e, d) => ({ emit: true, recurse: !maxDepth || d <= maxDepth }),
    emitError = true,
    depth = 0,
    partitions,
    progress,
}: {
    path: string,
    maxDepth?: number,
    callback?: WalkCallbackFn,
    emitError?: boolean,
    depth?: number,
    partitions?: Iterable<Partition>,
    progress?: Progress,
}): AsyncGenerator<Entry> {
    try {
        partitions ??= await Partition.getAll();
        const partition = await Partition.getForPath({ path, partitions });
        const entry = await Entry.create({ path, partition, partitions }); // TODO: eventually find a way to avoid finding the containing drive for every path - find a way to know when the path crosses under any of the stored mountpoints
        const { emit, recurse } = callback(entry, depth);
        if (progress) progress.count++;
        if (emit) {
            yield entry;
        }
        if (entry instanceof Directory && recurse && (!maxDepth || maxDepth === 0 || depth < maxDepth)) {
            try {
                const entries = await nodeFs.promises.readdir(path, { encoding: "utf-8", recursive: false });
                if (progress) progress.total += entries.length;
                for await (const dirEntry of entries) {
                    if (![".", ".."].includes(dirEntry)) {
                        yield* walk({ path: nodePath.join(path, dirEntry), maxDepth, callback, emitError, depth: depth + 1, partitions, progress });
                    }
                }
            } catch (err) {
                if (emitError) {
                    log(err);
                }
            }
        }
    } catch (err) {
        if (emitError) {
            log(err);
        }
    }
};

export class Hash extends UniqueAspect {
    constructor(public sha256: string) { super(); }

    get Query() {
        return ({
            byUnique: () => ({ "sha256": { "$eq": this.sha256, }, }),
        });
    }
    
    static async create(path: string) {
        try {
            const hashDigest = nodeCrypto.createHash('sha256');
            const input = nodeFs.createReadStream(path);
            return new Hash(await new Promise((resolve: (value: string) => void, reject): void => {
                input.on('end', () => resolve(hashDigest.digest('hex')));
                input.on('error', () => reject(`Error hashing file '${path}'`));
                input.on('readable', () => {
                    const data = input.read();
                    if (data)
                        hashDigest.update(data);
                });
            }));
        } catch (error) {
            throw new Error(`Error hashing file '${path}': ${error}`);
        }
    }
}
