
import { File, Directory, FileSystem, FileSystemEntry, calculateHash } from "./fs";
import * as db from "./db";
import { ArtefactClass, AspectClass, AspectProperties, mapObject, runAsync } from "./Model";
import { Artefact } from "../../models/Model";

export interface HashProps {
    sha256?: string;
};

class Hash extends AspectClass implements HashProps {
    sha256?: string;
    constructor({ sha256, ...aspect }: AspectProperties<HashProps>) {
        super(aspect);
        this.sha256 = sha256;
        if (!sha256) {
            this.runAsync(async () => {
                this.sha256 = await calculateHash(this._.getAspect(File)?.path);
            });
        }
    }
    async calculate() {
    }
}

// export interface HashProps {
//     sha256?: string;
// };

// // TODO: I want to make a utility function that removes the need to declare each property with a null-coalescing operator, like sha256: sha256 ?? await calc....()
// export const Hash = async ({ _, sha256 }: AspectProperties<HashProps>) => ({
//     _,
//     sha256: sha256 ?? await calculateHash(_.getAspect(File)?.path),
// });

class FileArtefact extends ArtefactClass {
    get fileEntry() { return this.getAspect(FileSystemEntry) || this.getAspect(File) || this.getAspect(Directory); }
    get file() { return this.getAspect(File); }
    get directory() { return this.getAspect(Directory); }
    async hash() {
        const task = async () => new Hash({ _: this, sha256: await calculateHash(this.file.path) });
        if ((this.file.stats?.size ?? 0) < (1024*1024)) {
            return await this.runForeground(task);
        } else {
            this.runBackground(task);
        }
    }
    query = {
        unique: () => this.constructor.prototype.query.unique() ?? ({ "file.path": this.file.path })
    }
}

async function main() {
    const store = await db.storage.store<FileArtefact>(FileArtefact, 'fileSystemEntries');
    for await (const fsEntry of FileArtefact.stream(FileSystem.walk("."))) {
        const dbEntry = await store.updateOrCreate(fsEntry);
        if (!dbEntry.hash) {

        }
    }
}

main();
