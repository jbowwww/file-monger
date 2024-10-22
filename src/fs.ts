import nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { Artefact, Aspect, AspectDataRequiredAndOptionalProperties, AspectDataProperties, AspectProperties, DataProperties } from './Model';

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
    
    constructor({ _, path, stats }: AspectDataProperties<FileEntry>) {
        super({ _ });
        this.path = path;
        this.stats = stats;
    }

    exists() { return nodeFs.existsSync(this.path); }

    static override async create({ _, path, ...aspect }: AspectDataRequiredAndOptionalProperties<FileEntry, "path">): Promise<FileEntry> {
        console.log(`create(): this = ${this} _ = ${JSON.stringify(_)} path=\"${path}\" aspect = ${JSON.stringify(aspect)} cwd=${process.cwd()}`);
        const stats = await nodeFs.promises.stat(path);
        console.log(`create(): stats = ${JSON.stringify(stats)}`);
        return stats.isFile() ? new File({ _, ...aspect, path, stats }) :
            stats.isDirectory() ? new Directory({ _, ...aspect, path, stats }) :
            new FileEntry({ _, path, stats });
    };

    static async* walk(path: string) {
        console.log(`walk(\"${path}\"): cwd=${process.cwd()}`);
        const rootEntry = await FileEntry.create({ _: null!, path });
        console.log(`walk(\"${path}\"): rootEntry = ${JSON.stringify(rootEntry)}`);
        yield rootEntry;
        if (isDirectory(rootEntry))
            yield* rootEntry.walk();
    }
}

// export const FileEntry = async ({ /* _, */ path, stats }: FileEntryProps) => ({
//     path,
//     stats: await nodeFs.promises.stat(path!)
//     async create({ path, _ }: AspectProperties<FileEntry>) {
//         const stats = ;
//         return new FileEntry({ path, stats, type: stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'unknown' });
//     }

//     exists() { return nodeFs.existsSync(this.path); }
// });

// export const FileEntry = async ({ /* _, */ path, stats }: FileEntryProps) => ({
//     path,
//     stats: await nodeFs.promises.stat(path!)
//     async create({ path, _ }: AspectProperties<FileEntry>) {
//         const stats = ;
//         return new FileEntry({ path, stats, type: stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'unknown' });
//     }

//     exists() { return nodeFs.existsSync(this.path); }
// });

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
// }

export const isDirectory = (value: any): value is Directory => !!value.walk;
export class Directory extends FileEntry {
    async* walk(): AsyncGenerator<FileEntry, void, undefined> {
        console.log(`walk(): this = ${JSON.stringify(this)}`);
        const entries = (await nodeFs.promises.readdir(this.path)).filter(e => e != "." && e != "..");
        console.log(`walk(): entries = ${JSON.stringify(entries)}`);
        const newFsEntries = await Promise.all(entries.map(entry => FileEntry.create({ path: nodePath.join(this.path, entry) })));
        console.log(`walk(): newFsEntries = ${JSON.stringify(newFsEntries)}`);
        const subDirs = newFsEntries.filter(d => isDirectory(d));
        console.log(`walk(): subDirs = ${JSON.stringify(subDirs)}`);
        yield* newFsEntries;
        for (const dir of subDirs)
            yield* dir.walk();
    }
}

//);
// export const Directory = async ({ /* _, */ path, stats }: FileEntryProps) => //pipeline(
//     // ({ path, stats }) =>
//     Object.assign(await pProps(Object.assign(await FileEntry({ path, stats }), {
//     // (_) => ({ ..._,
//         async* walk(this: DirectoryProps): AsyncGenerator<Partial<FileEntryProps>, void, undefined> {
//             const entries = await nodeFs.promises.readdir(path);
//             const newFsEntries = await Promise.all(entries.map(entry => FileEntry({ path: nodePath.join(path, entry) })));
//             const subDirs = newFsEntries.filter(d => isDirectory(d)) as Array<PromiseValue<ReturnType<typeof Directory>>>;
//             yield* newFsEntries;
//             for (const dir of subDirs)
//                 yield* dir.walk();
//         }
//     })));
// //);

export class UnknownFileEntry extends FileEntry {}

// async ({ /* _, */ path, stats }: FileEntryProps) => await FileEntry({ path, stats });

export class File extends FileEntry {
    hash?: string;
    constructor({ _, hash, ...fileEntry }: DataProperties<File>) {
        super({ _, ...fileEntry });
        this.hash = hash;
    }

    static override async create({ _, ...aspect }: AspectProperties<File>) {
        //const hash = await calculateHash(fileEntry.path);
        return new File({ _, ...aspect/* , hash */ });
    }
}
//  = async ({ /* _, */ path, stats }: FileEntryProps) =>
//     Object.assign(await FileEntry({ path, stats }), {
//         hash: await calculateHash(path),
//     });

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
