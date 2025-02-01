import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeCrypto from "node:crypto";
// import { Aspect, DiscriminatedModel, wrapModuleGeneratorMetadata } from ".";

export const moduleName = __filename.replace(/(\-)(.?)/g, (s, ...args: string[]) => args[1].toUpperCase());
//             let extIndex = moduleName.lastIndexOf(".");
//             if (extIndex > 0) {
//                 moduleName = moduleName.substring(0, extIndex);
//             }
//             aspect._T = moduleName + "/" + aspect._T;    //= Symbol("file-system.ts: FileSystem model");   // nodePath.basename(__filename.slice(__dirname.length + 1));
export type Namespace<T> = { [K in typeof moduleName]: T; };

export const enum EntryType {
    File        = "File",
    Directory   = "Directory",
    Unknown     = "Unknown",
};
export type EntryInnerBase<_T extends EntryType = EntryType.File | EntryType.Directory | EntryType.Unknown> = /* Aspect & */ {
    // [T in _T]: {
        _T: EntryType;
        path: string;
        stats: nodeFs.Stats;
    // }
};

export const getEntryType = (s: nodeFs.Stats) => (([
    [File, () => s.isFile()],
    [Directory, () => s.isDirectory()],
] as [(...args: any[]) => Promise<EntryInnerBase>, () => boolean][])
    .find<[(...args: any[]) => Promise<EntryInnerBase>, () => boolean]>(
        (value): value is [(...args: any[]) => Promise<EntryInnerBase>, () => boolean] => value[1]()
    ) ?? [Unknown, ])[0];

export type File = EntryInnerBase<EntryType.File>;
export const File = async ({ path, stats }: { path: string, stats: nodeFs.Stats }): Promise<File> => (/* { [EntryType.File]: */ { _T: EntryType.File, path, stats });
File.query = {
    byPath(path: string) { return ({ path }); },
};
export type Directory = EntryInnerBase<EntryType.Directory>;
export const Directory = async ({ path, stats }: { path: string, stats: nodeFs.Stats }): Promise<Directory> => (/* { [EntryType.Directory]: */ { _T: EntryType.Directory, path, stats });
export type Unknown = EntryInnerBase<EntryType.Unknown>;
export const Unknown = async ({ path, stats }: { path: string, stats: nodeFs.Stats }): Promise<Unknown> => (/* { [EntryType.Unknown]: */ { _T: EntryType.Unknown, path, stats });

export type Entry = File | Directory | Unknown;// EntryInnerBase<EntryType.File | EntryType.Directory | EntryType.Unknown>;
// export type NamespacedEntry = DiscriminatedModel<Entry>;
export const Entry = async ({ path }: { path: string }) => {
    const stats = await nodeFs.promises.stat(path!);
    const subType = getEntryType(stats);
    return /* { [subType.name]: */ await subType({ path, stats });
     /* ({ [subType.name]: */
};
Entry.query = {
    byPath(path: string) { return ({ path }); },
    // byPath: (e: EntryInnerBase) => ({ [e._T]: { path: e.path } }),
};

export const isEntryBase = (e: any, _T: EntryType): e is EntryInnerBase => !!e && e._T === _T && typeof e.path === 'string' && typeof e.stats === 'object';
export const isFile = (f: any): f is File => isEntryBase(f, EntryType.File);
export const isDirectory = (d: any): d is Directory => isEntryBase(d, EntryType.Directory);
export const isUnknown = (u: any): u is Unknown => isEntryBase(u, EntryType.Unknown);

export type WalkCallbackFn = (entry: Entry, depth: number) => { emit: boolean, recurse?: boolean };
export const walk = /* wrapModuleGeneratorMetadata(
    nodePath.basename(__filename.slice(__dirname.length + 1)), */
    async function *walk({
        path,
        maxDepth,
        callback = (e, d) => ({ emit: true, recurse: !maxDepth || d <= maxDepth }),
        emitError = true,
        depth = 0,
    }: {
        path: string,
        maxDepth?: number,
        callback?: WalkCallbackFn,
        emitError?: boolean,
        depth?: number,
    }): AsyncGenerator<Entry> {
        try {
            const entry = await Entry({ path });
            const { emit, recurse } = callback(entry, depth);
            if (emit) {
                yield entry;
            }
            if (isDirectory(entry) && recurse) {
                try {
                    const dir = await nodeFs.promises.opendir(path, { encoding: "utf-8", recursive: false });
                    for await (const dirEntry of dir) {
                        if (![".", ".."].includes(dirEntry.name)) {
                            yield* walk({ path: nodePath.join(dirEntry.parentPath, dirEntry.name), maxDepth, callback, emitError, depth: depth + 1 });
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

export type Hash = Awaited<ReturnType<typeof Hash>>;
export const Hash = async ({ path }: { path: string }) => {
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
        return ({ sha256 });
    } catch (error) {
        throw new Error(`Error hashing file '${path}': ${error}`);
    }
};
