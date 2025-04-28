import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeCrypto from "node:crypto";
import { Aspect, AspectParameters, Constructor, DiscriminatedModel, Optional, PartiallyRequired, UniqueAspect, throttle as cache } from ".";
import { Progress } from "../progress";
import si from "systeminformation";
import { Filter } from "mongodb";

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

export abstract class BlockDeviceBase extends UniqueAspect {
    name: string;
    identifier: string;
    type: string;
    fsType: string;
    mount: string;
    size: number;
    physical: string;
    uuid: string;
    removable: boolean;
    protocol: string;
    group?: string;
    device?: string;
    constructor(blockDevice: AspectParameters<BlockDeviceBase>) {
        super();
        this.name = blockDevice.name;
        this.identifier = blockDevice.identifier;
        this.type = blockDevice.type;
        this.fsType = blockDevice.fsType;
        this.mount = blockDevice.mount;
        this.size = blockDevice.size;
        this.physical = blockDevice.physical;
        this.uuid = blockDevice.uuid;
        this.removable = blockDevice.removable;
        this.protocol = blockDevice.protocol;
        this.group = blockDevice.group;
        this.device = blockDevice.device;
    }
}

export abstract class BlockDevice extends BlockDeviceBase {
    static ExpiryAgeMs = 15000;

    constructor(blockDevice: BlockDevice) {
        super(blockDevice);
    }

    static async getAll(): Promise<(si.Systeminformation.BlockDevicesData)[]> {
        return cache({
            expiryAgeMs: BlockDevice.ExpiryAgeMs,
        }, () => si.blockDevices())();
    }
}

export type GetDiskForPathOptions = {
    path: string;
    disks?: Iterable<Disk>;
};

export class Disk extends BlockDeviceBase {
    model: string;
    serial: string;

    constructor(disk: AspectParameters<Disk>) {
        super(disk);
        this.model = disk.model;
        this.serial = disk.serial;
    }

    Query() {
        return ({
            byUnique: () => ({ "$and": [ { "Disk.model": { "$eq": this.model } }, { "Disk.serial": { "$eq": this.serial } } ] }),
        });
    }
    
    static async getAll(): Promise<Disk[]> {
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

export class Partition extends BlockDeviceBase {
    uuid: string;

    constructor(partition: AspectParameters<Partition>) {
        super(partition);
        this.uuid = partition.uuid;
    }

    Query() {
        return ({
            byUnique: () => ({ "Partition.uuid": { "$eq": this.uuid } }),
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
        return Array.from(options.partitions).filter(p => options.path.startsWith(p.mount)).at(0);
    };
}

export abstract class Entry extends Aspect {
    path: string;
    stats: nodeFs.Stats;
    partition?: Partition;

    constructor({ path, stats, partition }: Omit<Entry, "_T" | "Query">) {
        super();
        this.path = path;
        this.stats = stats;
        this.partition = partition;
    }

    Query() {
        return ({
            byUnique: () => ({ [`${this._T}.path`]: this.path, }),
        })
    }

    static async create({ path, stats, partition, partitions }: PartiallyRequired<Entry, "path"> & { partitions?: Iterable<Partition>; }) {
        stats ??= await nodeFs.promises.stat(path);
        partition ??= (await Partition.getForPath({ partitions, path }));
        const entry = (
            stats.isFile() ? new File({ path, stats, partition }) :
            stats.isDirectory() ? new Directory({ path, stats, partition }) :
            new Unknown({ path, stats, partition }) );
        return entry as Entry;
    }
}

export class File extends Entry { constructor(file: Omit<File, "_T" | "Query">) { super({ ...file, }); }}
export class Directory extends Entry { constructor(directory: Omit<Directory, "_T" | "Query">) { super({ ...directory, }); }}
export class Unknown extends Entry { constructor(unknown: Omit<Unknown, "_T" | "Query">) { super({ ...unknown, }); }}

type File_ = { _T: "File"; }
type Directory_ = { _T: "Directory"; }
type Unknown_ = { _T: "Unknown"; }

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

export class Hash extends Aspect {
    constructor(public sha256: string) { super(); }

    Query() {
        return ({
            byUnique: () => ({ "Hash.sha256": { "$eq": this.sha256, }, }),
        })
    }
    
    static async create(path: string): Promise<Hash> {
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
