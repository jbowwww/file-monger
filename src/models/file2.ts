import * as nodeFs from 'fs';
import * as nodePath from 'path';
import { calculateHash } from '../file';
import { isAsyncIterable, isIterable } from './base/Artefact2';
import { Timestamped } from './base';

namespace FileSystem {

/*
 * Ongoing reminder of the things I want File aspects / models /classes/modules(<-less OOP more FP?)
 *
 *  - Determine if the File (/dir too?) at its (immutable?) FS path:
 *      + (a) exists, and
 *      + (b) the time lapsed since the model (whether isNew() or loaded from Storage) was (re-)stat()'d 
 *          - (b)(ii) if new stat()'s appear to have changed (any properties from new check / re-stat() are different to DB/model)
 *          - (b)(iii) either and/or both of these values/conditions should (configurably ig?) be capable/configurable of either/and:
 *              + invalidating/flagging and/or deleting (or just Timestamping certain values/model properties that are!) certain values
 *                in the DB/model (like hash(s)(should maybe eventually use several hash/checksum algorithms)) that are
 *                  - dynamic
 *                  - "reactive"
 *                  - invalidate-able (note: this obviously implies "validation" is an important operation/aspect of this general idea/problem)
 *              + triggering re-fresh() of the values
 *                  - this inevitably requires a (very likely often async) function associated with such dynamic properties.
 *                      + getters and setters could be perfect for the job
 *                          - model could cache the result / debounce the function invocation - rewrite the model property as plain data property(&vice/versa)
 *                              + definition of and easy (re-)assigning to and from _pure data_  DB models/DTO TS _interfaces_ for each aspect model type,
 *                                even if they end up being also being actual classes with instance methods, would make for easy save/load to/from Storage
 *                                
 *
 *  */

// Adds a setter and getter function to a property, allowing  same name, with type TimeStampedValue
// export function TimeStamped<T>(target: any, property: ClassFieldDecoratorContext) {
//     const descriptor = Object.getOwnPropertyDescriptor(target.prototype, property.name);
//     if (descriptor !== undefined) {
//         descriptor.set = (v: T) => {
//             descriptor.value = v;
//             descriptor.value._ts = Date.now();
//         };
//     }
// }

export enum CalculateHashEnum {
    Disable,
    Inline,
    Async,
};

    // async updateOrCreate(store: Store, options: UpdateOrCreateFileOptions = UpdateOrCreateFileOptions.default) {
    //     process.stdout.write(`File '${this.path}' `);
    //     let dbFile = await store.findOne(this.query.findOne());
    //     if (dbFile === null)
    //         console.log(`does not exist yet in local DB`);
    //     else if (!dbFile.hash)
    //         console.log(`has a local DB entry without a hash: ${JSON.stringify(dbFile)}`);
    //     else if (this.stats.size !== dbFile.stats.size || this.stats.mtimeMs > dbFile.stats.mtimeMs) {
    //         console.log(`has an expired hash in the local DB: ${JSON.stringify(dbFile)}\n\tFile.stat=${JSON.stringify(this.stats)}`);
    //         this.previousHashes.push(dbFile.hash);
    //     } else {
    //         console.log(`has a valid hash in the local DB: ${JSON.stringify(dbFile)}`);
    //         return;
    //     }
    //     if (dbFile !== null)
    //         this._id = dbFile._id;
    //     else if (this._id === undefined)
    //         this._id = new UUID().toHexString();
    //     const result = await store.updateOne(this.query.findOne(), { $set: this.toData() }, { upsert: true });
    //     if (/* result.upsertedCount > 0 &&  */result.upsertedId)
    //         this._id = result.upsertedId;
    //     const thisDoc = await store.findOne(this.query.findOne());
    //     console.log(`updateOrCreate: thisDoc=${JSON.stringify(thisDoc)}`);
    //     if (options.calculateHash === CalculateHashEnum.Inline) {
    //         await this.calculateHash();
    //         await store.updateOne(this.query.findOne(), { $set: this.toData() }, { upsert: true });
    //         const thisDoc = await store.findOne(this.query.findOne());
    //         console.log(`updateOrCreate: thisDoc=${JSON.stringify(thisDoc)}`);
    //     } else if (options.calculateHash === CalculateHashEnum.Async) {
    //         (async () => {
    //             await this.calculateHash();
    //             await store.updateOne(this.query.findOne(), { $set: this.toData() }, { upsert: true });
    //             const thisDoc = await store.findOne(this.query.findOne());
    //             console.log(`updateOrCreate: thisDoc=${JSON.stringify(thisDoc)}`);
    //         })();
    //     }
    // }

    // public get query() {
    //     return ({
    //         ...super.query,
    //         byPath  :   () => ({ path: this.path }),
    //         findOne :   () => (this._id !== undefined ? this.query.byId() : this.query.byPath() ),
    //     });
    // }
    
    // async* walk(): AsyncGenerator<File | Directory | Error, void, undefined> {
    //     const entries = await nodeFs.promises.readdir(this.path);
    //     const newFsEntries = await Promise.all(entries.map(entry => FileSystem.create(nodePath.join(this.path, entry))));
    //     const subDirs = newFsEntries.filter(entry => entry instanceof Directory) as Directory[];
    //     yield* newFsEntries;
    //     for (const subDir of subDirs)
    //         yield* subDir.walk();
    // }

export type FileSystemEntryBase = {
    path: string;
    stats?: TimeStamped<nodeFs.Stats>;
    // type: 'file' | 'dir' | 'unknown';
};

export type File = FileSystemEntryBase & {
    type: 'file';
    hash?: string;
};
export const isFile = (obj: any): obj is File => obj.type === 'file';

export type Directory = FileSystemEntryBase & {
    type: 'dir';
};
export const isDirectory = (obj: any): obj is Directory => obj.type === 'dir';

export type Unknown = FileSystemEntryBase & {
    type: 'unknown';
};
export const isUnknown = (obj: any): obj is Unknown => obj.type === 'unknown';

export type FileSystemEntry = File | Directory | Unknown;

    export type Stage<TIn = any, TOut = any> = (arg: TIn) => TOut | Promise<TOut>;
    export type Test<T = any> = (obj: T) => boolean;
export type TypeGuard<T> = (obj: any) => obj is T;

export type PipelineClosureFunction<T = any> = (pipe: Pipeline<T>) => void;
export class Pipeline<TInput> {
 
    stages: Array<Stage> = [];

    // Building the pipeline within this close function allows the pipeline to reference itself
    // This, for one thing, allows pipeline stages to call pipe.run() to generate data for itself e.g. recursing file system walks
    constructor(pipelineClosure?: PipelineClosureFunction<TInput>) {
        if (pipelineClosure !== undefined)
            pipelineClosure(this);
    }

    // "Compiles" the pipeline from this.stages and executes it - with one singular input value
    async run<TOutput>(source: TInput | Iterable<TOutput> | AsyncIterable<TInput>) {
        const compiledPipeline = async (arg: TInput) => this.stages.reduce((arg, stage) => await stage(arg), source as any) as TOutput;
        if (isIterable(source)) {
            for (const arg of source) {
                yield await compiledPipeline(arg);
            }
            return this as any as Generator<TOutput>;    // NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
        } else if (isAsyncIterable(source)) {
            for await (const arg of source) {
                yield await compiledPipeline(arg);
            }
            return this as any as AsyncGenerator<TOutput>;// NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
        } else {
            return await compiledPipeline(source as TInput);
        }
    }

    // "Compiles" the pipeline from this.stages and executes it using each value the Iteratable or AsyncIterable source yields (also re-yields each output value)
    async iterate<TOutput>(source: Iterable<TInput> | AsyncIterable<TInput>): Promise<TOutput | Iterable<TOutput> | AsyncIterable<TOutput>> {
        const compiledPipeline = async (arg: TInput) => this.stages.reduce((arg, stage) => await stage(arg), source) as TOutput;
        if (isIterable(source)) {
            for (const arg of source) {
                yield await compiledPipeline(arg);
            }
            return this as any as Generator<TOutput>;    // NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
        } else if (isAsyncIterable(source)) {
            for await (const arg of source) {
                yield await compiledPipeline(arg);
            }
            return this as any as AsyncGenerator<TOutput>;// NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
        } else {
            throw new TypeError(`source is not Iterable or AsyncIterable: shouldn't happen`);
        }
    }

    // "Compiles" the pipeline from this.stages and executes it using each value the Iteratable or AsyncIterable source yields (without re-yielding output values) 
    async ingest<TOutput>(source: Iterable<TInput> | AsyncIterable<TInput>): Promise<unknown> {
        return await this.iterate(source) as Promise<unknown>;
    }

    // typecast
    as<TOutput>() { new Pipeline<TOutput>(); }
 
    // (potentially async) map function
    map<TOutput>(stage: (arg: TInput) => TOutput | Promise<TOutput>) {
        this.stages.push(stage);
        return this as any as Pipeline<TOutput>;    // NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
    }
 
    // Branching
    tap(output: (obj: TInput) => void) {
        return this.map(arg => output(arg));
    }

    // Conditional branching
    // Can be used for type switching by using type guard functions for the 'test' parameter
    if<TOutput extends TInput = TInput>(
        test: TypeGuard<TOutput> | Test<TInput>,
        onTrue: (obj: TOutput) => TOutput | Promise<TOutput> | Promise<unknown>,
        onFalse: (obj: TInput) => TOutput | Promise<TOutput> | Promise<unknown> = arg => arg as TOutput
    ) {
        return this.map(arg => test(arg) ? onTrue(arg as TOutput) : onFalse(arg as TInput));
    }

    // input / insertion points? 
    
    // Piping iterables

    // ...
}

export class Timestamp {
    public _created: Date;
    public _updated: Date;
    public _modified: Date;
    constructor() {
        this._created = new Date();
        this._updated = this._created;
        this._modified = this._updated;
    }
    update(time?: Date) {
        this._updated = time ?? new Date();
    }
}

export type TimeStamped<T = any> = {
    value: T;
    _ts: Timestamp;
    valueOf(): Object;
};
export function TimeStamped<T = any>(previousValue?: TimeStamped<T>, value: T): TimeStamped<T> {
    return ({ value, _ts: new Timestamp(), valueOf() { return this.value as Object; } });
}

export const FileSystemEntryPipeline =

    // Pipeline input is FS path strings inside POJO objects (e.g. { path: string })
    new Pipeline<{
        path: string,
        stats?: TimeStamped<nodeFs.Stats>,
    }>( pipe => { pipe

        // Perform a stat() on the FS path, then we can also use this to classify the items (i.e. { type: 'file' | 'dir' | 'unknown' })
        .map( async ({ path, stats }) => (<FileSystemEntryBase>{ path, stats: TimeStamped(stats, await nodeFs.promises.stat(path)) }) )
        .map( async ({ path, stats }) => (<FileSystemEntry>{ path, stats, type: stats?.isFile() ? 'file' : stats?.value.isDirectory() ? 'dir' : 'unknown' }) )
        

        .if( isDirectory, async directory => await pipe.run((await nodeFs.promises.readdir(directory.path)).map(subDir => ({ path: nodePath.join(directory.path, subDir) }))))
        .if( isFile, file => ({ ...file, hash: file.hash === undefined || file.stats.mtime > file.hash._ts.updated ?await calculateHash(file.path) }) )
        .if( isUnknown, unknown => unknown )
            .run({ path: './' });
    
    });

};