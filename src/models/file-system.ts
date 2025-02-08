import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeCrypto from "node:crypto";
import { DiscriminatedModel } from ".";
import { Progress } from "../progress";

export const enum EntryType {
    File = "File",
    Directory = "Directory",
    Unknown = "Unknown",
};
export type EntryBase<_T extends EntryType> = {
    _T: _T;
    path: string;
    stats: nodeFs.Stats;
};

export type File = EntryBase<EntryType.File>;
export const File = ({ path, stats }: ({ path: string, stats: nodeFs.Stats })) => ({ _T: EntryType.File, path, stats });
export type Directory = EntryBase<EntryType.Directory>;
export const Directory = ({ path, stats }: ({ path: string, stats: nodeFs.Stats })) => ({ _T: EntryType.Directory, path, stats });
export type Unknown = EntryBase<EntryType.Unknown>;
export const Unknown = ({ path, stats }: ({ path: string, stats: nodeFs.Stats })) => ({ _T: EntryType.Unknown, path, stats });

export type Entry = File | Directory | Unknown;
export const Entry = async ({ path }: { path: string }): Promise<Entry> => {
    const stats = await nodeFs.promises.stat(path!);
    return stats.isFile() ? File({ path, stats }) : stats.isDirectory() ? Directory({ path, stats }) : Unknown({ path, stats });
};
export type NamespacedEntry = DiscriminatedModel<Entry, "_T">;

export const isEntry = (e: any, _T: EntryType): e is EntryBase<typeof _T> => !!e && e._T === _T && typeof e.path === 'string' && typeof e.stats === 'object';
export const isFile = (f: any): f is File => isEntry(f, EntryType.File);
export const isDirectory = (d: any): d is Directory => isEntry(d, EntryType.Directory);
export const isUnknown = (u: any): u is Unknown => isEntry(u, EntryType.Unknown);

export type WalkCallbackFn = (entry: Entry, depth: number) => { emit: boolean, recurse?: boolean };
export const walk = /* wrapModuleGeneratorMetadata(
    nodePath.basename(__filename.slice(__dirname.length + 1)), */
    async function* walk({
        path,
        maxDepth,
        callback = (e, d) => ({ emit: true, recurse: !maxDepth || d <= maxDepth }),
        emitError = true,
        depth = 0,
        progress,
    }: {
        path: string,
        maxDepth?: number,
        callback?: WalkCallbackFn,
        emitError?: boolean,
        depth?: number,
        progress?: Progress,
    }): AsyncGenerator<Entry> {
        try {
            const entry = await Entry({ path });
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
                            yield* walk({ path: nodePath.join(path, dirEntry), maxDepth, callback, emitError, depth: depth + 1, progress });
                        }
                    }
                } catch (err) {
                    if (emitError) {
                        console.error(err);
                    }
                }
            }
        } catch (err) {
            if (emitError) {
                console.error(err);
            }
        }
    };
// );

export const enum HashType { Hash = "Hash" };
export type Hash = { _T: /* string; */ HashType.Hash; sha256: string; };//Awaited<ReturnType<typeof Hash>>

export const Hash = async ({ path }: { path: string })/* : Hash */ => {
    try {
        const hashDigest = nodeCrypto.createHash('sha256');
        const input = nodeFs.createReadStream(path);
        const sha256 = await new Promise((resolve: (value: string) => void, reject): void => {
            input.on('end', () => resolve(hashDigest.digest('hex')));
            input.on('error', () => reject(`Error hashing file '${path}'`));
            input.on('readable', () => {
                const data = input.read();
                if (data)
                    hashDigest.update(data);
            });
        });
        return ({ _T: HashType.Hash, _ts: Date.now(), sha256 });
    } catch (error) {
        throw new Error(`Error hashing file '${path}': ${error}`);
    }
};
