import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeCrypto from "node:crypto";
import { isAsyncFunction, isGeneratorFunction } from "node:util/types";

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

export type EntryTypeName = string;// "File" | "Directory" | "Unknown";// EntryType.File | EntryType.Directory | EntryType.Unknown;
export const getEntryType = (s: nodeFs.Stats) => (([
    ["File", () => s.isFile()],
    ["Directory", () => s.isDirectory()],
] as [EntryTypeName, () => boolean][])
    .find<[EntryTypeName, () => boolean]>(
        (value): value is [EntryTypeName, () => boolean] => value[1]()
    ) ?? ["Unknown", ])[0];

export type EntryInnerBase = {
    path: string;
    stats: nodeFs.Stats;
};

export type File = { File: EntryInnerBase; };
export type Directory = { Directory: EntryInnerBase; };
export type Unknown = { Unknown: EntryInnerBase; };

export type Entry = File | Directory | Unknown;// Awaited<ReturnType<typeof Entry>>;
export const Entry = async ({ path }: { path: string }): Promise<Entry> => {
    const stats = await nodeFs.promises.stat(path!);
    return ({ [getEntryType(stats)]: { path, stats } }) as Entry;
};
Entry.query = {
    byPath: (entry: Entry) =>
        isFile(entry)       ?   { "File.path":      entry.File.path         } :
        isDirectory(entry)  ?   { "Directory.path": entry.Directory.path    } :
                                { "Unknown.path":   entry.Unknown.path      },// isUnknown(entry) ? { "Unknown.path": entry.Unknown.path }, //{ const K = Object.keys(entry)?.[0] as EntryTypeName; return ({ [`${K}.path`]: entry[K].path }); },
};

export const isEntryInnerBase = (e: any): e is EntryInnerBase => !!e && typeof e.path === 'string' && typeof e.stats === 'object';
export const isFile = (f: any): f is File => isEntryInnerBase(f.File);//.path === 'string' && typeof f.File.stats === 'object';// === EntryType.File;
export const isDirectory = (d: any): d is Directory => isEntryInnerBase(d.Directory);//d._T === EntryType.Directory;
export const isUnknown = (u: any): u is Unknown => isEntryInnerBase(u.Unknown);//_T === EntryType.Unknown;

export type WalkCallbackFn = (entry: Entry, depth: number) => { emit: boolean, recurse?: boolean };
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
        const entry = await Entry({ path });
        const { emit, recurse } = callback(entry, depth);
        if (emit) {
            yield entry;
        }
        if (isDirectory(entry) && recurse) {
            try {
                const dir = await nodeFs.promises.opendir(path, { encoding: "utf-8", recursive: false });
                for await (const dirEntry of dir) {
                    yield* walk({ path: nodePath.join(dirEntry.parentPath, dirEntry.name), maxDepth, callback, emitError, depth: depth + 1 });
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
