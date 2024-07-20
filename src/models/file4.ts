import * as nodeFs from 'fs';
import * as nodePath from 'path';
import { calculateHash } from '../file';
import { createAsync, isAsyncIterable, isIterable } from './types';
import { Model } from './Model';

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

export const FileSystem = {
   
    async create(path: string): Promise<File | Directory /* | Error */> {
        const stats = await nodeFs.promises.stat(path);
        return stats.isFile() ? new File({ path, stats })
            : stats.isDirectory() ? new Directory({ path, stats }) : null;
            // : new Error(`Unknown stat entry type for path '${path}'`);
    },
    
    async* walk(path: string): AsyncGenerator<File | Directory/*  | Error */, void, undefined> {
        const rootEntry = FileSystem.create(path);
        yield rootEntry;
        if (rootEntry instanceof Directory)
            yield* (rootEntry as Directory).walk();
    }
    
};

export abstract class FileSystemEntryBase extends Model {

    path: string;
    stats: nodeFs.Stats;

    constructor({ path, stats }: FileSystemEntryBase) {
        super();
        this.path = path;
        this.stats = stats;
    }

    static async createAsync<FileSystemEntry>({ path, stats }: { path: string, stats?: nodeFs.Stats}) {
        stats ??= await nodeFs.promises.stat(path);
        const newEntry =
            stats.isFile()      ? { _type: 'file', path, stats } :
            stats.isDirectory() ? { _type: 'dir' , path, stats } :
            { _type: 'unknown', path, stats };
        return newEntry as FileSystemEntry;
    }
}

export class Directory extends FileSystemEntryBase {

    async* walk(): AsyncGenerator<File | Directory/*  | Error */, void, undefined> {
        const entries = await nodeFs.promises.readdir(this.path);
        const newFsEntries = await Promise.all(entries.map(entry => FileSystem.create(nodePath.join(this.path, entry))));
        const subDirs = newFsEntries.filter(entry => entry instanceof Directory) as Directory[];
        yield* newFsEntries;
        for (const subDir of subDirs)
            yield* subDir.walk();
    }

}

export class Unknown extends FileSystemEntryBase { }

export class File extends FileSystemEntryBase {
    hash?: string;
    previousHashes: string[] = [];

    constructor(file: Omit<File, "previousHashes"> & { previousHashes?: string[] }) {
        super(file);
        this.path = file.path;
        this.stats = file.stats;
        this.hash = file.hash;
        this.previousHashes = file.previousHashes ?? [];
    }
}

export type FileSystemEntry = File | Directory | Unknown;
