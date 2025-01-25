import { db } from "./db";
import * as FileSystem from "./file-system";

type Aspect = { /* _T: string; */ };

export type Artefact = { _id?: string; };
const Artefact = (...aspects: Aspect[]) => Object.assign({}, aspects.map(a => ({ [a._T]: a })));

for await (const entry of FileSystem.walk({ path: "./" })) {
    
}
async function main() {
    db.configure(() => new db.MongoStorage("mongodb://mongo:mongo@localhost:27017/"));
    const store = await db.store<FileArtefact>(FileArtefact, 'fileSystemEntries');
    for await (const fsEntry of FileArtefact.stream(FileSystem.walk({ path: "./" }))) {
        const dbEntry = await store.findOne;
        if (!dbEntry.hash) {

        }
    }
}

main();
