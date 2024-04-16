import * as fs from 'fs';
import { Collection, WithId } from 'mongodb'; // TODO: An abstracted "Storage" ;ayer/class/types so not tied to mongo
import { calculateHash } from '../file';
import { DataProperties, Model } from './base';
import { Aspect } from './base/Artefact';

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
export type TimeStampedValue<TValue, TValueGetter = () => Promise<TValue>> {
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

export interface File {
    path: string,           // file system path
    stats: TimeStampedValue<fs.Stats>,        // fs.stat()  
    // hash?: string,          // hash of file contents
    hash: TimeStampedHash;
    previousHashes?: TimeStampedHash[],  // previous hash(es), not necessarily consecutive however. Can aid in determining relative file versions
}

// @Aspect
export class File extends Model<File> {

    path: string;
    stats: TimeStampedValue<fs.Stats>;
    hash: TimeStampedHash;
    previousHashes?: TimeStampedHash[] = [];

    constructor(file: DataProperties<File>) {
        super(file);
        // this.path = file?.path ?? "";
        // this.stats = Object.assign(new fs.Stats(), file?.stats ?? {});
        this.hash = file?.hash;
        this.previousHashes = file?.previousHashes ?? [];
    }

    static async findOrCreateFromPath(path: string, collection: Collection<File>) {
        const stats = await fs.promises.stat(path);
        if (!stats.isFile())
            throw new Error(`Path '${path}' is not a file`);
        else
            process.stdout.write(`File '${path}' `);
        let dbFile = await collection.findOne({ path });
        let file = dbFile === null ? null : new File(dbFile);
        if (file && file.stats.size === stats.size && file.stats.mtimeMs === stats.mtimeMs && file.hash !== undefined) {
            console.log(`has a valid hash in the local DB: ${JSON.stringify(file)}`);
        } else {
            if (!file) {
                file = new File({ path, stats });
                console.log(`does not exist yet in local DB: ${JSON.stringify(file)}`);
            } else if (!file.hash) {
                console.log(`has a local DB entry without a hash: ${JSON.stringify(file)}`)
            } else {
                console.log(`has an expired hash in the local DB: ${JSON.stringify(file)}\n\tFile.stat=${JSON.stringify(stats)}`);
            }
            file.stats = stats;
            await file.calculateHash();
            await collection.updateOne({ path }, { $set: file }, { upsert: true });
            console.log();
        }
        return file;
    }

    async calculateHash() {
        process.stdout.write(`Calculating hash for file '${this.path}' ... `);
        if (this.hash) {
            this.previousHashes?.push({ hash: this.hash, mTimeMs: this.stats.mtimeMs, timestamp: new Date(Date.now()) });
        }
        this.hash = await calculateHash(this.path);
        console.log(this.hash);
        return this.hash;
    }
}
