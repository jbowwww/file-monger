
import { File, Directory, FileSystem, FileSystemEntry, calculateHash } from "./fs";
import * as db from "./db";
import { Artefact, AspectClass, AspectProperties, mapObject, runAsync } from "./Model";

// export interface HashProps {
//     sha256?: string;
// };

// class Hash extends AspectClass implements HashProps {
//     sha256?: string;
//     constructor({ _, sha256 }: AspectProperties<HashProps>) {
//         super(_);
//         if (!sha256) {
//             this.sha256 = this.runAsync(async () => await calculateHash(this._.getAspect(File)?.path));
//         } else {
//             this.sha256 = sha256;
//         }
//     }
// }

export interface HashProps {
    sha256?: string;
};

export const Hash = (({ _, ...props }: AspectProperties<HashProps>) => mapObject() ({ ...props, ...()
    sha256: sha256 ?? await calculateHash(_.getAspect(File)?.path),
    constructor({ _, sha256 }: AspectProperties<HashProps>) {
        super(_);
        if (!sha256) {
            this.sha256 = this.runAsync(async () => await calculateHash(this._.getAspect(File)?.path));
        } else {
            this.sha256 = sha256;
        }
    }
}
class FileArtefact extends Artefact {
    static {
        this.addAspectType(Hash, [File]);
    }
}

async function main() {
    const store = await db.storage.store('fileSystemEntries');
    for await (const fsEntry of FileArtefact.stream(FileSystem.walk("."))) {
        const dbEntry = await store.updateOrCreate(fsEntry);
        if (!dbEntry.getAspect(File)?.hash) {

        }
    }
}

main();
