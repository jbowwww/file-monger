import nodeFs from "node:fs";
import nodePath from "node:path";
import { buildPipeline as pipeline } from "@fieldguide/pipeline";

// export const pipe = <TIn, TOut>(...stages: Array<(arg: any) => Promise<unknown>>) => async (arg: unknown) => await (stages.reduce((acc, value, index, stages) => value(acc), arg))/*  as (arg: TIn) => Promise<TOut> */;
// export const select = <TIn, TOut>(...stages: Array<[(arg: any) => Promise<boolean>, (arg: any) => Promise<unknown>]>) => async (arg: any) => await (stages.find(s => !!s[0](arg))?.[1] ?? ((a: any) => undefined))(arg)/* (arg) as (arg: TIn) => Promise<TOut> */;

// export type Stage<T1 = any, T2 = unknown> = (arg: T1) => Promise<T2>;
// export type Pipeline<TIn = any, TOut = unknown> = Stage<TIn, TOut> & { pipe<TNewOut>(stage: Stage<TOut, TNewOut>): Pipeline<TIn, TNewOut> };
// export const pipeline = <TIn, TOut>(/* inStage: Stage<TIn, unknown>, */ ...stages: Array<(arg: any) => Promise<unknown>>/* , outStage?: Stage<any, TOut> */): Pipeline<TIn, TOut> =>
//     multipipe(      //nodeStream.compose
//         Object.setPrototypeOf(
//         Object.setPrototypeOf(
//             stages.reduce((acc, value, index, stages) => (arg: TIn) => value(acc(arg))),
//             {
//                 pipe<TNewOut>(stage: Stage<TOut, TNewOut>) { return pipeline(async (arg: TIn) => await stage(await (this as Stage<TIn, TOut>)(arg))); },
//             }),
//             Function);
// export class pipeline<TIn, TOut> extends Function {
//     constructor(...stages: Array<(arg: any) => Promise<unknown>>) {
//         super())
//         return this.add(...stages);
//     }
//     add(...stages: Array<(arg: any) => Promise<unknown>>) {
//         return stages.reduce((acc, value, index, stages) => async (arg: TIn) => await value(acc), arg) as (arg: TIn) => Promise<TOut>;
//     }
// }

// export const namespace = <TIn, TOut>(...stages: Array<(arg: any) => Promise<unknown>>) => (stages.reduce((acc, value, index, stages) => async (arg: unknown) => await value(acc))) as (arg: TIn) => Promise<TOut>;

//
// move later
//

export interface AsyncIterableError<T> extends Error {
    element?: Partial<T>;
};
export const IsError = (e: any): e is Error => e instanceof Error;

export class Query<T extends {}> {
    with<K extends keyof T>(value: T[K]) {
    
    }
};

export type UpsertFn<T extends {} = any> = (storage: Storage, value: T, oldValue: T | undefined) => {

};

export const enum EntryType {
    File        = "File",
    Directory   = "Directory",
    Unknown     = "Unknown",
};
// export type Entry<_T extends EntryType = EntryType.Unknown> = {
//     _T: _T;
//     path: string;
//     stats: nodeFs.Stats;
// };
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
// export type Entry = ReturnType<typeof Entry>;

// export type EntryBase<_T extends EntryType = EntryType["File"] | EntryType["Directory"] | EntryType.["Unknown"]> = {
//     _T: _T;
//     path: string;
//     stats: nodeFs.Stats;
// };
// export type File = EntryBase<EntryType["File"]>///* "File" */; };
// export type Directory = EntryBase<EntryType["Directory"]>;
// export type Unknown = EntryBase<EntryType["Unknown"]>;

// export const EntryType = {
//     File: "File",
//     Directory: "Directory",
//     Unknown: "Unknown",
// } as const;
// export type EntryType = typeof EntryType;
// // export type Entry<_T extends EntryType = EntryType.Unknown> = {
// //     _T: _T;
// //     path: string;
// //     stats: nodeFs.Stats;
// // };
// export type EntryBase<_T extends EntryType = EntryType["File"] | EntryType["Directory"] | EntryType.["Unknown"]> = {
//     _T: _T;
//     path: string;
//     stats: nodeFs.Stats;
// };
// export type File = EntryBase<EntryType["File"]>///* "File" */; };
// export type Directory = EntryBase<EntryType["Directory"]>;
// export type Unknown = EntryBase<EntryType["Unknown"]>;

// export const Entry = <_T extends EntryType>({ _T, path }: { _T?: _T, path: string }) => {
//     const stats = await nodeFs.promises.stat(path);
//     if (!!_T && (stats.isFile() && _T !== EntryType.File || stats.isDirectory() && _T !== EntryType.Directory)) {
//         throw new TypeError(`_T is specified but doesn't match nodeFs.Stats for path="${path}"`);
//     }
//     return ({
//         _T: _T ?? stats.isFile() ? _T !== EntryType.File : stats.isDirectory() ? _T !== EntryType.Directory : EntryType.Unknown,
//         path,
//         stats,
//     })
// };

//  = {
//     File: {
//         _T: "File";
//         path: string;
//         stats: nodeFs.Stats;
//     },
//     Directory: {
//         _T: "Directory";
//         path: string;
//         stats: nodeFs.Stats;
//     },
//     Unknown: {
//         _T: "Unknown";
//         path: string;
//         stats: nodeFs.Stats;
//     },
// };

// export type EntryType = Entry[keyof Entry]
// export const enum EntryType {
//     File        = "File",
//     Directory   = "Directory",
//     Unknown     = "Unknown",
// };
// export type EntryBase<_T extends EntryType = EntryType.Unknown> = {
//     _T: _T;
//     path: string;
//     stats: nodeFs.Stats;
// };
// export type Entry = File | Directory | Unknown;
// export const Entry = async (path: string) => {
//     const stats = await nodeFs.promises.stat(path);
//     return (stats.isFile()      ?   { _T: EntryType.File,       path, stats } :
//             stats.isDirectory() ?   { _T: EntryType.Directory,  path, stats } :
//                                     { _T: EntryType.Unknown,    path, stats });
// };
// export type File = EntryBase<EntryType.File>///* "File" */; };
// export type Directory = EntryBase<EntryType.Directory>;
// export type Unknown = EntryBase<EntryType.Unknown>;
// export type EntrySchema = DiscriminatedModel<Entry, "_T">;
// export const EntryModel = makeDiscriminatedModel({ File, Directory, Unknown }
// })
// export type EntryType = Entry["_T"];

// A "system" in the language of this new trial folders
export const File = (file: File) => {
    return ({
        async* createOrUpdate(file: File) {

        }
    });
};

// can these be created as one generic is<T> using these mapped discriminated unions ?
export const isFile = (f: any): f is File => f._T === "file";
export const isDirectory = (d: any): d is Directory => d._T === "directory";
export const isUnknown = (u: any): u is Unknown => u._T === "unknown";

// export function create<T extends Entry, _T extends T["_T"] ? /* string */ /* Entry["_T"] */ /* EntryType */ = T["_T"]>(t: _T) {
//     return ({ "_T": t });//T["_T"] as string })
// };
// export function create2<T extends { [K: EntryType]: Entry }, K extends keyof T = keyof T>(model: { [K]: T[K] ) {
//     return ({ "_T": t });//T["_T"] as string })
// }
// export function is<T extends Entry>()
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
}): AsyncGenerator<Entry | AsyncIterableError<Entry>> {
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