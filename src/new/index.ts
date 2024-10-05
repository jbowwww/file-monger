
import { File, Directory, FileSystem, FileSystemEntry } from "./fs";
import * as db from "../db";
import { Artefact } from "../models/Model";
import { Filter } from 'mongodb';

class FileArtefact extends Artefact {
    get fsEntry() { return this.get(FileSystemEntry); }
    get file() { return this.get(File); }
    get dir() { return this.get(Directory); }
    // override getKey() {
    //     return (this._id !== undefined ?
    //         ({ _id: { $eq: this._id } }) :
    //         ({ $or: [
    //             { "file.path": { $eq: this.file?.path } },
    //             { "dir.path": { $eq: this.dir?.path } },
    //         ]}));
    // }
    get query() {
        return ({
            ...super.query,
            byPrimary: () => File.query.byPath(this.fsEntry!.path),
        })
    }
};

async function main() {
    const store = await db.storage.store<FileArtefact>('fileSystemEntries');
    for await (const fsEntry of FileArtefact.stream(FileSystem.walk("."))) {
        const dbEntry = await store.updateOrCreate(fsEntry);
        if (dbEntry.get(File)?.hash === undefined) {

        }
    }
}

main();
