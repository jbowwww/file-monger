import * as fs from 'fs';
import { Collection, WithId } from 'mongodb'; // TODO: An abstracted "Storage" ;ayer/class/types so not tied to mongo
import { calculateHash } from '../file';
import { DataProperties, Model } from './base';

export interface TimeStampedHash {
    hash: string;
    mTimeMs: number;
    timestamp: Date;
}

export interface File {
    path: string,           // file system path
    stats: fs.Stats,        // fs.stat()  
    hash?: string,          // hash of file contents
    previousHashes?: TimeStampedHash[],  // previous hash(es), not necessarily consecutive however. Can aid in determining relative file versions
}

export class File extends Model {
    path: string;
    stats: fs.Stats;
    hash?: string;
    previousHashes?: TimeStampedHash[] = [];

    constructor(file: DataProperties<File>) {
        super(file);
        this.path = file?.path ?? "";
        this.stats = Object.assign(new fs.Stats(), file?.stats ?? {});
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
