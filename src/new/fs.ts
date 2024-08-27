import * as nodeFs from 'fs';
import * as nodePath from 'path';
import Model, { ModelProperties } from '../models/Model';

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


export function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj.hasOwnProperty(Symbol.asyncIterator);
}

export function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj.hasOwnProperty(Symbol.iterator);
}

export const FileSystem = {
    async create(path: string): Promise<FileSystemEntry> {
        const stats = await nodeFs.promises.stat(path);
        return stats.isFile() ? new File({ path, stats })
            : stats.isDirectory() ? new Directory({ path, stats })
                : new Unknown({ path, stats });
        // : new Error(`Unknown stat entry type for path '${path}'`);
    },

    async* walk(path: string): AsyncGenerator<FileSystemEntry, void, undefined> {
        const rootEntry = FileSystem.create(path);
        yield rootEntry;
        if (rootEntry instanceof Directory)
            yield* (rootEntry as Directory).walk();
    }
};

export abstract class FileSystemEntry extends Model {

    // static _type: string = 'unknown';

    path: string;
    stats?: nodeFs.Stats;

    constructor({ path, stats }: ModelProperties<FileSystemEntry>) {
        super();
        this.path = path;
        if (stats === undefined) {
            this.queueTask(async() => {
                this.stats = await nodeFs.promises.stat(path);
            });
        } else {
            this.stats = stats instanceof nodeFs.Stats ?
                stats :
                Object.assign(new nodeFs.Stats(), stats);
        }
    }

    isFile() { return this.stats?.isFile(); }
    isDirectory() { return this.stats?.isDirectory(); }

    query() {
        return Model.buildModelQueries({
            byPath: (path: string) => ({ path }),
        });
    }

    //query(ies)
    // static byPath<A extends ArtefactData>(this: typeof FileSystemEntryBase | typeof File | typeof Directory) : QueryBuilderFunction<A> {
    //     return (artefact: Artefact<A>) => 
    //         this === FileSystemEntryBase ? {
    //             $or: [File, Directory]
    //                 .filter(modelCtor => artefact.get(modelCtor) != null)
    //                 .map(modelCtor => ({ [`${modelCtor.name}.path`]: artefact.get(modelCtor)?.path }))
    //         } : ({ [`${this.name}.path`]: artefact.get(this as typeof File | typeof Directory)?.path });
    // }    
}

export class Directory extends FileSystemEntry {

    static _type: string = 'directory';

    async* walk(): AsyncGenerator<FileSystemEntry, void, undefined> {
        const entries = await nodeFs.promises.readdir(this.path);
        const newFsEntries = await Promise.all(entries.map(entry => FileSystem.create(nodePath.join(this.path, entry))));
        const subDirs = newFsEntries.filter(entry => entry instanceof Directory);
        yield* newFsEntries;
        for (const subDir of subDirs)
            yield* subDir.walk();
    }

}

export class Unknown extends FileSystemEntry { }

export class File extends FileSystemEntry {

    static _type: string = 'file';

    hash?: string;

    constructor(file: ModelProperties<File>) {
        super(file);
        this.hash = file.hash;
    }

}

// export type FileSystemEntry = File | Directory | Unknown;
