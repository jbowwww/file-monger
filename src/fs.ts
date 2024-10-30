import nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { Aspect, AspectDataRequiredAndOptionalProperties, DataProperties } from './Model';

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

export class FileEntry extends Aspect {
    path: string;
    stats: nodeFs.Stats;
    
    constructor({ _, path, stats }: DataProperties<FileEntry>) {
        super({ _ });
        this.path = path;
        this.stats = stats;
    }

    static override async create({ _, path }: AspectDataRequiredAndOptionalProperties<FileEntry, "path">) {
        const stats = await nodeFs.promises.stat(path);
        return (
            stats.isFile() ? await File.create({ _, path, stats }) :
            stats.isDirectory() ? await Directory.create({ _, path, stats }) :
            new UnknownFileEntry({ _, path, stats }));
    };

    exists() { return nodeFs.existsSync(this.path); }

    static async* walk(path: string) {
        const rootEntry = await FileEntry.create({ _: null!, path });
        yield rootEntry;
        if (Directory.is(rootEntry)) {
            yield* (rootEntry as Directory).walk();
        }
    }
}

export class Directory extends FileEntry {
    static override async create({ _, ...fileEntry }: AspectDataRequiredAndOptionalProperties<File, keyof FileEntry>) {
        return new Directory({ _, ...fileEntry });
    }

    async* walk(): AsyncGenerator<FileEntry, void, undefined> {
        process.stdout.write(`walk(): ${this.path} ... `);
        const newFsEntries = await Promise.all(
            (await nodeFs.promises.readdir(this.path))
                .filter(e => e != "." && e != "..")
                .map(entry => FileEntry.create({ path: nodePath.join(this.path, entry) })));
        const subDirs = newFsEntries.filter(d => Directory.is(d));
        const subUnknowns = newFsEntries.filter(u => UnknownFileEntry.is(u));
        process.stdout.write(`${newFsEntries.length - subDirs.length - subUnknowns.length} files, ${subDirs.length} subdirs, ${subUnknowns.length} unknown entries\n`);
        yield* newFsEntries;
        for (const dir of subDirs)
            yield* dir.walk();
    }
}

export class UnknownFileEntry extends FileEntry {}

export class File extends FileEntry {
    hash?: string;

    constructor({ _, hash, ...fileEntry }: DataProperties<File>) {
        super({ _, ...fileEntry });
        this.hash = hash;
    }

    static override async create({ _, hash, ...fileEntry }: AspectDataRequiredAndOptionalProperties<File, keyof FileEntry/* "path" | "stats" */>) {
        hash = hash ?? await calculateHash(fileEntry.path);
        return new this({ _, ...fileEntry, hash });
    }
}

export async function calculateHash(path: string) {
    try {
        const hashDigest = nodeCrypto.createHash('sha256');
        const input = nodeFs.createReadStream(path);
        const hash = await new Promise((resolve: (value: string) => void, reject): void => {
            input.on('end', () => { input.destroy(); return resolve(hashDigest.digest('hex')); });
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
