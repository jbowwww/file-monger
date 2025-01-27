import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeCrypto from "node:crypto";
import { isAsyncFunction, isGeneratorFunction } from "node:util/types";
import { Aspect, wrapModuleGeneratorMetadata } from ".";

export type PipelineFunctionStage<I = any, O = any> = (input: I) => O | Promise<O>;
export type PipelineGeneratorStage<I = any, O = any> = (source: AsyncIterable<I>) => AsyncIterable<O>;
export type PipelineStage<I = any, O = any> = PipelineFunctionStage<I, O> | PipelineGeneratorStage<IArguments, O>;

export const makeGeneratorFromFunction = <I = any, O = any>(stage: PipelineFunctionStage<I, O | Promise<O>>) =>
    async function* generatorStage(source: AsyncIterable<I>) {
        for await (const input of source) {
            yield await stage(input) as O;
        }
    };

export const compose = <I = any, O = any>(...stages: PipelineStage[]) => (source: AsyncIterable<I>) =>
    stages.reduce((acc, curr, i, arr) => isGeneratorFunction(curr) && isAsyncFunction(curr) ?
        (curr as any as AsyncGeneratorFunction)(acc) :
        makeGeneratorFromFunction(curr)(acc), source as AsyncIterable<any>);

export const enum EntryType {
    File        = "File",
    Directory   = "Directory",
    Unknown     = "Unknown",
};
export type EntryInnerBase<_T extends EntryType = EntryType.File | EntryType.Directory | EntryType.Unknown> = Aspect & {
    [T in _T]: {
        // _T: EntryType;
        path: string;
        stats: nodeFs.Stats;
    }
};

export const getEntryType = (s: nodeFs.Stats) => (([
    [File, () => s.isFile()],
    [Directory, () => s.isDirectory()],
] as [(...args: any[]) => Promise<EntryInnerBase>, () => boolean][])
    .find<[(...args: any[]) => Promise<EntryInnerBase>, () => boolean]>(
        (value): value is [(...args: any[]) => Promise<EntryInnerBase>, () => boolean] => value[1]()
    ) ?? [Unknown, ])[0];

export type File = EntryInnerBase<EntryType.File>;
const File = async ({ path, stats }: { path: string, stats: nodeFs.Stats }): Promise<File> => ({ _T: EntryType.File, path, stats });
export type Directory = EntryInnerBase<EntryType.Directory>;
const Directory = async ({ path, stats }: { path: string, stats: nodeFs.Stats }): Promise<Directory> => ({ _T: EntryType.Directory, path, stats });
export type Unknown = EntryInnerBase<EntryType.Unknown>;
const Unknown = async ({ path, stats }: { path: string, stats: nodeFs.Stats }): Promise<Unknown> => ({ _T: EntryType.Unknown, path, stats });

export type Entry = File | Directory | Unknown;// EntryInnerBase<EntryType.File | EntryType.Directory | EntryType.Unknown>;
// export type NamespacedEntry = DiscriminatedModel<Entry>;
export const Entry = async ({ path }: { path: string }): Promise<{ [K in keyof Entry]: any }> => {
    const stats = await nodeFs.promises.stat(path!);
    const subType = getEntryType(stats);
    return ({ [subType.name]: await subType({ path, stats }) })
     /* ({ [subType.name]: */
};
Entry.query = {
    byPath: (e: EntryInnerBase) => ({ [e._T]: { path: e.path } }),
};

export const isEntryBase = (e: any, _T: EntryType): e is EntryInnerBase => !!e && e._T === _T && typeof e.path === 'string' && typeof e.stats === 'object';
export const isFile = (f: any): f is File => isEntryBase(f, EntryType.File);
export const isDirectory = (d: any): d is Directory => isEntryBase(d, EntryType.Directory);
export const isUnknown = (u: any): u is Unknown => isEntryBase(u, EntryType.Unknown);

export type WalkCallbackFn = (entry: Entry, depth: number) => { emit: boolean, recurse?: boolean };
export const walk = wrapModuleGeneratorMetadata(
    nodePath.basename(__filename.slice(__dirname.length + 1)),
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
    }
);

export async function calculateHash(path: string) {
    try {
        const hashDigest = nodeCrypto.createHash('sha256');
        const input = nodeFs.createReadStream(path);
        const hash = await new Promise((resolve: (value: string) => void, reject): void => {
            input.on('end', () => resolve(hashDigest.digest('hex')));
            input.on('error', () => reject(`Error hashing file '${path}'`));
            input.on('readable', () => {
                const data = input.read();
                if (data)
                    hashDigest.update(data);
            });
        });
        return hash;
    } catch (error) {
        throw new Error(`Error hashing file '${path}': ${error}`);
    }
}
