import * as nodeFs from 'fs';
import * as nodePath from 'path';
import { Collection, UUID, UpdateFilter, WithId } from 'mongodb'; // TODO: An abstracted "Storage" ;ayer/class/types so not tied to mongo
import { calculateHash } from '../file';
import { DataProperties, IModel, Model, UpdateOrCreateOptions } from './base';
import { Aspect } from './base/Artefact';
import { Store } from '../db';

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
export type TimeStampedValue<TValue, TValueGetter = () => Promise<TValue>> = {
    status: "valid";
    version: number;
    value: TValue;
    mTimeMs: number;
    timestamp: Date;
} | {
    status: "new";
    version: 0;
    value: TValueGetter;
    mTimeMs: number;        // when a value has status: "new", mTimeMs and timestamp will still have valid timestamps, but they are time the TimeStampedValue was created
    timestamp: Date;
} | {
    status: "expired" | "scheduled" | "running";
    version: number;
    mTimeMs: number;
    timestamp: Date;
};

export type TimeStampedHash = TimeStampedValue<string>;

// Adds a setter and getter function to a property, allowing  same name, with type TimeStampedValue
export function TimeStamped<T>(target: any, property: ClassFieldDecoratorContext) {
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, property.name);
    if (descriptor !== undefined) {
        descriptor.set = (v: T) => {
            descriptor.value = v;
            descriptor.value._ts = Date.now();
        };
    }
}

export enum CalculateHashEnum {
    Disable,
    Inline,
    Async,
};

export interface UpdateOrCreateFileOptions extends UpdateOrCreateOptions {
    calculateHash?: CalculateHashEnum;
};
export var UpdateOrCreateFileOptions: {
    default: UpdateOrCreateFileOptions;
} = {
    default: {
        calculateHash: CalculateHashEnum.Inline,//.Async,
    },
};

export interface IFile extends IModel {
    path: string;
    stats: nodeFs.Stats;
    hash?: string;
    previousHashes?: string[];
}

// @Aspect
export class File extends Model<File> {

    path: string;
    // @TimeStamped
    stats: nodeFs.Stats;
    // @TimeStamped
    hash?: string;
    previousHashes: string[] = [];

    constructor(file: IFile) {
        super(File, file);

        this.path = file.path;
        this.stats = file.stats;
        this.hash = file.hash;
        this.previousHashes = file.previousHashes ?? [];
    }

    query = {
        findOne: (): UpdateFilter<File> => (this._id !== undefined ? { _id: this._id } : { path: this.path }),
    };

    async updateOrCreate(store: Store<{ File: File, Directory: Directory }, File | Directory>, options: UpdateOrCreateFileOptions = UpdateOrCreateFileOptions.default) {
        process.stdout.write(`File '${this.path}' `);
        let dbFile = await store.findOne(this.query.findOne());
        if (dbFile === null)
            console.log(`does not exist yet in local DB`);
        else if (!dbFile.hash)
            console.log(`has a local DB entry without a hash: ${JSON.stringify(dbFile)}`);
        else if (this.stats.size !== dbFile.stats.size || this.stats.mtimeMs > dbFile.stats.mtimeMs) {
            console.log(`has an expired hash in the local DB: ${JSON.stringify(dbFile)}\n\tFile.stat=${JSON.stringify(this.stats)}`);
            this.previousHashes.push(dbFile.hash);
        } else {
            console.log(`has a valid hash in the local DB: ${JSON.stringify(dbFile)}`);
            return;
        }
        if (dbFile !== null)
            this._id = dbFile._id;
        else if (this._id === undefined)
            this._id = new UUID().toHexString();
        const result = await store.updateOne(this.query.findOne(), { $set: this.toData() }, { upsert: true });
        if (/* result.upsertedCount > 0 &&  */result.upsertedId)
            this._id = result.upsertedId;
        const thisDoc = await store.findOne(this.query.findOne());
        console.log(`updateOrCreate: thisDoc=${JSON.stringify(thisDoc)}`);
        if (options.calculateHash === CalculateHashEnum.Inline) {
            await this.calculateHash();
            await store.updateOne(this.query.findOne(), { $set: this.toData() }, { upsert: true });
            const thisDoc = await store.findOne(this.query.findOne());
            console.log(`updateOrCreate: thisDoc=${JSON.stringify(thisDoc)}`);
        } else if (options.calculateHash === CalculateHashEnum.Async) {
            (async () => {
                await this.calculateHash();
                await store.updateOne(this.query.findOne(), { $set: this.toData() }, { upsert: true });
                const thisDoc = await store.findOne(this.query.findOne());
                console.log(`updateOrCreate: thisDoc=${JSON.stringify(thisDoc)}`);
            })();
        }
    }

    async calculateHash() {
        process.stdout.write(`Calculating hash for file '${this.path}' ... `);
        if (this.hash) {
            this.previousHashes.push(this.hash);
            this.hash = undefined;
        }
        this.hash = await calculateHash(this.path);
        console.log(this.hash);
        return this.hash;
    }
}

export interface IDirectory extends IModel {
    path: string;
    stats: nodeFs.Stats;
}

export class Directory extends Model<Directory> {
    
    path: string;
    stats: nodeFs.Stats;

    constructor(directory: IDirectory) {
        super(Directory, directory);
        this.path = directory.path;
        this.stats = directory.stats;
    }

    async* walk(): AsyncGenerator<File | Directory | Error, void, undefined> {
        const entries = await nodeFs.promises.readdir(this.path);
        const newFsEntries = await Promise.all(entries.map(entry => FileSystem.create(nodePath.join(this.path, entry))));
        const subDirs = newFsEntries.filter(entry => entry instanceof Directory) as Directory[];
        yield* newFsEntries;
        for (const subDir of subDirs)
            yield* subDir.walk();
    }
}

export const FileSystem = {

    async create(path: string): Promise<File | Directory | Error> {
        const stats = await nodeFs.promises.stat(path);
        return stats.isFile() ? new File({ path, stats })
            : stats.isDirectory() ? new Directory({ path, stats })
            : new Error(`Unknown stat entry type for path '${path}'`);
    },

    async* walk(path: string): AsyncGenerator<File | Directory | Error, void, undefined> {
        const rootEntry = FileSystem.create(path);
        yield rootEntry;
        if (rootEntry instanceof Directory)
            yield* (rootEntry as Directory).walk();
    },

};
