import nodeFs from "node:fs";
import nodePath from "node:path";
import { buildPipeline as pipeline } from "@fieldguide/pipeline";

export const enum EntryType {
    File        = "File",
    Directory   = "Directory",
    Unknown     = "Unknown",
};
export type EntryBase<_T extends EntryType = EntryType.File | EntryType.Directory | EntryType.Unknown> = {
    _T: _T;
    path: string;
    stats: nodeFs.Stats;
};
export type File = EntryBase<EntryType.File>///* "File" */; };
export type Directory = EntryBase<EntryType.Directory>;
export type Unknown = EntryBase<EntryType.Unknown>;
export type Entry = File | Directory | Unknown;
export const Entry = pipeline<EntryBase, {}, EntryBase>({       // { name: string, arguments: { path: string, stats?: nodeFs.Stats } }
    name: "FileSystem.Entry",
    initializer: ({ path }) => ({ }),
    stages: [
        async (context, { name, arguments: { path } }) => ({ stats: await nodeFs.promises.stat(path) }),
        async (context, { name, arguments: { path, stats } }) => ({ _T: stats.isFile() ? EntryType.File : stats.isDirectory() ? EntryType.Directory : EntryType.Unknown })
    ],
    resultsValidator: (result: Partial<EntryBase<EntryType>>): result is EntryBase<EntryType> => true,
});

// can these be created as one generic is<T> using these mapped discriminated unions ?
export const isFile = (f: any): f is File => f._T === "file";
export const isDirectory = (d: any): d is Directory => d._T === "directory";
export const isUnknown = (u: any): u is Unknown => u._T === "unknown";

export type WalkCallbackFn = (entry: EntryBase, depth: number) => { emit: boolean, recurse?: boolean };
export async function *walk({
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
        const stats = await nodeFs.promises.stat(path);
        const entry: Entry = //create
            stats.isFile()      ?   { _T: EntryType.File,       path, stats } :
            stats.isDirectory() ?   { _T: EntryType.Directory,  path, stats } :
                                    { _T: EntryType.Unknown,    path, stats } ;
        const { emit, recurse } = callback(entry, depth);
        if (emit) {
            yield entry;
        }
        if (isDirectory(entry) && recurse) {
            try {
                const dir = await nodeFs.promises.opendir(path, { encoding: "utf-8", recursive: false });
                for await (const entry of dir) {
                    yield* walk({ path: nodePath.join(entry.parentPath, entry.name), maxDepth, callback, emitError, depth: depth + 1 });
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

export const operations = {
    generators: {
        walk,
    },
    filters: {
        isFile,
        isDirectory,
        isUnknown,
    },
};