import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeCrypto from "node:crypto";
import { Aspect, Constructor, DiscriminatedModel, PartiallyRequired, throttle as cache } from ".";
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

export const FileSystemBlockDevicesExpiryAgeMs = 15000;
export const blockDevices: si.Systeminformation.BlockDevicesData[] = [];
export const getBlockDevices = cache({
    expiryAgeMs: FileSystemBlockDevicesExpiryAgeMs,
}, async function getBlockDevices() {
    return await si.blockDevices();
});

export class BlockDevice extends Aspect {
    name: string;
    identifier: string;
    type: string;
    fsType: string;
    mount: string;
    size: number;
    physical: string;
    label: string;
    removable: boolean;
    protocol: string;
    group?: string;
    device?: string;

    constructor(blockDevice: BlockDevice) {
        super();
        this.name = blockDevice.name;
        this.identifier = blockDevice.identifier;
        this.type = blockDevice.type;
        this.fsType = blockDevice.fsType;
        this.mount = blockDevice.mount;
        this.size = blockDevice.size;
        this.physical = blockDevice.physical;
        this.label = blockDevice.label;
        this.removable = blockDevice.removable;
        this.protocol = blockDevice.protocol;
        this.group = blockDevice.group;
        this.device = blockDevice.device;
    }
}

export class Disk extends BlockDevice {
    model: string;
    serial: string;
    constructor(disk: Disk) {
        super(disk);
        this.model = disk.model;
        this.serial = disk.serial;
    }
    static async getDisks(): Promise<Disk[]> {
        return getBlockDevices().then(blockDevices => blockDevices
            .filter(bd => bd.type === "disk")
            .map(bd => ({ _T: "Disk", ...bd })));
    }
}

export type GetPartitionForPathOptions = {
    path: string;
    partitions?: Iterable<Partition>;
};

export class Partition extends BlockDevice {
    label: string;
    constructor(partition: Partition) {
        super(partition);
        this.label = partition.label;
    }
    static async getAll(): Promise<Partition[]> {
        return getBlockDevices().then(blockDevices => blockDevices
            .filter(bd => bd.type === "part")
            .map(bd => ({ _T: "Partition", ...bd })));
    }

    static async getForPath(pathOrOptions: string | GetPartitionForPathOptions) {
        const options: GetPartitionForPathOptions = typeof pathOrOptions === "string" ? { path: pathOrOptions } : pathOrOptions;
        options.partitions ??= await Partition.getAll();
        return Array.from(options.partitions).filter(p => options.path.startsWith(p.mount)).at(0);
    };
}

export const EntryTypeNames = {
    File: "File" as const,
    Directory: "Directory" as const,
    Unknown: "Unknown" as const,
};
//  as const
export type EntryTypeName = typeof EntryTypeNames[keyof typeof EntryTypeNames];
export abstract class Entry implements Aspect {
    path: string;
    stats: nodeFs.Stats;
    partition?: Partition;
    constructor({ path, stats, partition }: Entry) {
        this.path = path;
        this.stats = stats;
        this.partition = partition;
    }
    static async create({ path, stats, partition, partitions }: PartiallyRequired<Entry, "path"> & { partitions?: Iterable<Partition>; }) {
        stats ??= await nodeFs.promises.stat(path);
        partition ??= (await Partition.getForPath({ partitions, path }));
        const entry = (
            stats.isFile() ? new File({ path, stats, partition }) :
            stats.isDirectory() ? new Directory({ path, stats, partition }) :
            new Unknown({ path, stats, partition }) );
        return entry;
    }
}

export class File extends Entry { constructor(file: File) { super(file); }}
export class Directory extends Entry { }
export class Unknown extends Entry { }

// export type Entry = File | Directory | Unknown;
// export type NamespacedEntry = DiscriminatedModel<Constructor<File | Directory | Unknown>>;

export const isEntry = (e: any, _T: EntryTypeName): e is Entry => !!e && e._T === _T && typeof e.path === 'string' && typeof e.stats === 'object';
export const isFile = (f: any): f is File => isEntry(f, EntryTypeNames.File);
export const isDirectory = (d: any): d is Directory => isEntry(d, EntryTypeNames.Directory);
export const isUnknown = (u: any): u is Unknown => isEntry(u, EntryTypeNames.Unknown);

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
        if (isDirectory(entry) && recurse) {
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
