import * as nodeFs from 'fs';
import * as nodePath from 'path';

import { File, Directory, Unknown, FileSystem, FileSystemEntry } from "./fs";
import * as db from "../db";
import { isFile } from "../models/file5";
import { Artefact, ArtefactData, makeArtefactView } from "../models/Model";
import { makeArtefactType } from './Artefact1';

// abstract class Artefact<T> {
//     constructor(init: Partial<T> = {}) {
//         Object.assign(this, Object.fromEntries(
//             Object.entries(init).map(([K, V]) => ([K, V]))
//         ));
//     }
// }

// class Artefact<T extends Artefact<T>> {
//     constructor(init: Partial<T> = {}) {
//         Object.assign(this, Object.fromEntries(
//             Object.entries(init).map(([K, V]) => ([K, V]))
//         ));
//     }

//     static async* stream<T extends Artefact<T>>(this: { new (): T } & typeof Artefact<T>, source: AsyncGenerator<T>) {
//         for await (const item of source) {
//             yield new this(item);
//         }
//     }
// }

// class FileArtefact extends Artefact<FileArtefact> {
//     file!: File;
//     dir!: Directory;
//     unknown!: Unknown;
//     constructor(init: Partial<FileArtefact>) {
//         super(init);
//     }
// }

// const FileArtefact = makeArtefactType({
//     file: File,
//     dir: Directory,
//     unknown: Unknown,
//     // audio: Audio,
// });


// class FileArtefact extends Artefact {
//     get fsEntry() { return this.get(FileSystemEntry); }
//     get file() { return this.get(File); }
//     get dir() { return this.get(Directory); }
// };

// class FileArtefactView = makeArtefactView({
//     fsEntry: FileSystemEntry,
//     file: File,
//     dir: Directory,
// });

async function main() {
    const store = await db.storage.store('fileSystemEntries');
    for await (const fsEntry of /* Artefact.stream<FileSystemEntry,FileArtefact>( */FileSystem.walk(".")) {
        const dbEntry = await store.findOne(FileSystemEntry.query.byPath());
        if (
            dbEntry === undefined ||
            dbEntry!.get().stats.mtime !== fsEntry.stats.mtime ||
            dbEntry!.file.stats.size !== fsEntry.stats.size
        ) {
            fileSystemEntries.updateOne({ path: fsEntry.path }, fsEntry, { upsert: true });
            if (fsEntry.isFile() && dbEntry!.file.hash === undefined)
        }
    }
}

main();
