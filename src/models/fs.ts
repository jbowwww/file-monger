import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { calculateHash } from '../file';
import { PromiseValue } from '../Model';

// export const FsEntry = async ({ path, stats }: { path: string, stats: nodeFs.Stats }) => stats.isFile() ? File({ path, stats }) : stats.isDirectory() ? Directory({ path, stats }) : Unknown({ path, stats });
// export const FileSystemEntry = async ({ path }: { path: string }) => FsEntry({ path, stats: await nodeFs.promises.lstat(path) });
export type AspectFnThis<I extends {}[] = any[], A extends {} = {}> = ({ ctor?: AspectFn<I, { [x: string]: A }> }) | void;
export type AspectFn<I extends {}[], A extends {}> = (/* this: AspectFnThis<I, A>, */ ...init: I) => Promise<A & { ctor?: AspectFn<I, { [x: string]: A }> }>;
export const makeAspectCtor = <I extends {}[], A extends {}>(aspectFn: AspectFn<I, A>) => {
    async function aspectCtor(/* this: AspectFnThis<I, A>, */ ...init: I) {
        const aspect = await aspectFn/* .call */(/* this, */ ...init);
        if (!aspect.ctor) {
            aspect.ctor = aspectCtor;
        }
        return ({
            [aspectFn.name]: aspect
        });
    }
    const _ctor = Object.defineProperties(aspectCtor, {
        name: { configurable: true, enumerable: false, writable: false, value: aspectFn.name }
    });
    return aspectCtor;
};

export const FileSystemEntry = makeAspectCtor(async function (/* this: AspectFnThis, */ { path }: { path: string }) {
    const stats = await nodeFs.promises.lstat(path);
    return  stats.isFile()      ?   File({ /* ...this, */ path, stats }) :
            stats.isDirectory() ?   Directory({ path, stats }) :
                                    Unknown({ path, stats });
});

//    return Object.defineProperties(aspect
//         /* {
//         [nodePath.parse(__filename).name]: */
//         ({
//             File: { path, stats }
//         }), {
//             ctor: {
//                 configurable: true,
//                 enumerable: false,
//                 writable: false,
//                 value: ctor,
//             }
//         });
// };

export type FileSystemEntry = PromiseValue<ReturnType<typeof FileSystemEntry>>;

// export const makeConfigurableFn = <O extends {}, F extends Function>(defaultOptions: O, fn: (options: O) => F) =>
//     Object.assign(fn(defaultOptions), { configureOptions: (options: O) => makeConfigurableFn(options, fn) });
// makeConfigurableFn(
//     { typeNames: { File: "file", Directory: "directory", Unknown: "unknown" } },
//     ({ typeNames: { File, Directory, Unknown } }) =>
//         async ({ path }: { path: string }) => {
//             const stats = await nodeFs.promises.lstat(path);
//             return stats.isFile() ? ({
//                 [File]: { path, stats }
//             }) : stats.isDirectory() ? ({
//                 [Directory]: { path, stats }
//             }) : ({
//                 [Unknown]: { path, stats }
//             });
//         }
//     );

export const File = makeAspectCtor(async function File(/* this: AspectFnThis, */ { path, stats }: { path: string, stats: nodeFs.Stats }) { return ({ /* ...this, */ path, stats } /* } */); });
// export const File = async ({ path, stats }: FileSystemEntry /* { path: string, stats: nodeFs.Stats } */) => ({ _T: "File", path, stats });
export type File = PromiseValue<ReturnType<typeof File>>;
export const Directory = makeAspectCtor( async function Directory(/* this: AspectFnThis, */ { path, stats }: { path: string, stats: nodeFs.Stats }) { return ({ /* Directory: { */ path, stats }); });
// export const Directory = async ({ path, stats }: FileSystemEntry /* { path: string, stats: nodeFs.Stats } */) => ({ _T: "Directory", path, stats });
export type Directory = PromiseValue<ReturnType<typeof Directory>>;
export const Unknown = makeAspectCtor( async function Unknown(/* this: AspectFnThis, */ { path, stats }: { path: string, stats: nodeFs.Stats }) { return ({ /* Unknown: { */ path, stats }); });
// export const Unknown = async ({ path, stats }: FileSystemEntry /* { path: string, stats: nodeFs.Stats } */) => ({ _T: "Unknown", path, stats });
export type Unknown = PromiseValue<ReturnType<typeof Unknown>>;

// export type FileSystemEntry = File | Directory | Unknown;


// export type FileSystemEntryTypeNames =keyof FileSystemEntry;//'File' | 'Directory' | 'Unknown';

// export type FileSystemEntryTypes = {
//     File: File,
//     Directory: Directory,
//     Unknown: FileSystemEntry,
// };

// export const Hash = async ({ path, stats }: { path: string, stats: nodeFs.Stats }) => calculateHash(path, /* stats */);
export const Hash = makeAspectCtor(async function Hash(path: string, hash?: { sha256: string, _ts: number } }) =>
    (file && (!hash || (Date.now() - hash!._ts) > 3600000) || file.stats) &&
    ({ file, hash: { sha256: await calculateHash(file.path), _ts: Date.now() } });
export type Hash = PromiseValue<ReturnType<typeof Hash>>;

export async function* walk(path: string): AsyncGenerator<PromiseValue<ReturnType<typeof FileSystemEntry>>> {
    console.log(`FileEntry.walk(\"${path}\"): start ...`);
    const rootEntry = await FileSystemEntry({ path });
    yield rootEntry;
    if (rootEntry.Directory) {
        yield* walk(rootEntry.Directory.path);
    }
}