import nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { AspectClass, AspectProperties } from './Model';

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
    async* walk(path: string): AsyncGenerator<FileSystemEntry, void, undefined> {
        const rootEntry = await FileSystemEntry.create(path);
        yield rootEntry;
        if (rootEntry instanceof Directory)
            yield* rootEntry.walk();
    }
};

export interface FileSystemEntryProps {
    path: string;
    stats?: nodeFs.Stats;
}

export abstract class FileSystemEntry extends AspectClass implements FileSystemEntryProps {
    path: string;
    stats?: nodeFs.Stats;

    static async create(path: string): Promise<FileSystemEntry> {
        const stats = await nodeFs.promises.stat(path);
        return stats.isFile() ? new File({ path, stats }) :
            stats.isDirectory() ? new Directory({ path, stats }) :
            new Unknown({ path, stats });
    }

    constructor({ path, stats, ...aspect }: AspectProperties<FileSystemEntryProps>) {
        super(aspect);
        this.path = path;
        this.stats = stats;
    }

    // static query = {
    //     ...Model.query,
    //     // this.buildModelQueries({
    //     byPath: (path: string) => ({ path }),
    // // });
    // };

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
    async* walk(): AsyncGenerator<FileSystemEntry, void, undefined> {
        const entries = await nodeFs.promises.readdir(this.path);
        const newFsEntries = await Promise.all(entries.map(entry => FileSystemEntry.create(nodePath.join(this.path, entry))));
        const subDirs = newFsEntries.filter(entry => entry instanceof Directory);
        yield* newFsEntries;
        for (const dir of subDirs)
            yield* dir.walk();
    }
}

export class Unknown extends FileSystemEntry { }

// export interface FileProps extends FileSystemEntryProps {
//     hash?: string;
// }

export class File extends FileSystemEntry { }
//     hash?: string;
//     constructor({ hash, ...aspect }: AspectProperties<FileProps>) {
//         super(aspect);
//         this.hash = hash;
//     }
// }

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
