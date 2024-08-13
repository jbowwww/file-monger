import { File, Directory, Unknown, FileSystem, FileSystemEntry, FileSystemEntryBase } from "./fs";
import * as db from "../db";
import { isFile } from "../models/file5";
import { unknown } from "zod";
import { Artefact } from "../models/Model";

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


type FileArtefact = {
    file: File;
    dir: Directory;
    unknown: Unknown;
    // audio: Audio,
};

async function main() {
    const store = await db.storage.store<FileArtefact>('fileSystemEntries');
    for await (const fsEntry of /* Artefact.stream<FileSystemEntry,FileArtefact>( */FileSystem.walk(".")) {
        const dbEntry = await store.findOne(fsEntry.query(FileSystemEntryBase.byPath));
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
