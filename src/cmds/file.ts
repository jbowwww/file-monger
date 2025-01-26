import * as nodeUtil from "node:util";
import * as db from '../db';
import { File, Directory, walk, calculateHash, Entry } from "../models/file-system";
import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact } from '../models';
import { MongoError } from "mongodb";

export enum CalculateHashEnum {
    Disable,
    Wait,
    Background,
};

export interface FileCommandArgv {
    dbUrl: string,
    paths: string[],
    calculateHash?: {
        type: CalculateHashEnum,
        default: CalculateHashEnum.Wait,
    },
}

class Hash /* extends Aspect */ {
    sha256?: string;

    constructor({ sha256/* , ...aspect */ }: Partial<Hash>) {
        // super(aspect);
        this.sha256 = sha256;
    }
    
    static /* override */ async create({ /* _, */ path }: { /* _,: Artefact, */ path: string }) {
        const sha256 = await calculateHash(path);
        return new Hash({ /* _, */ sha256 })
    }
}

export const command = 'file';
export const description = 'File commands';
export const builder = (yargs: yargs.Argv) => yargs
    .command('index <paths...>', 'Index file', yargs => yargs
        .positional('paths', {
            type: "string",
            description: 'Path(s) to file(s) or shell glob expression(s) that will get expanded',
            array: true,
            demandOption: true
        }),
        async function (argv): Promise<void> {
            for (const path of argv.paths) {
                // const store = await db.storage.store<FileSystemArtefact>('fileSystemEntries');
                // for await (const fsEntry of FileSystemArtefact.stream(walk({ path })/* , (_, e) => _.FileEntry = e */)) {
                //     const dbEntry = (await store.updateOrCreate(fsEntry, { [fsEntry.._T]: { path: fsEntry.get(fsEntry._T).path }}));
                //     console.log(`\ndbEntry = ${JSON.stringify(dbEntry)}`);
                //     if (!dbEntry?._.File/* Entry */) {

                //     }
                // }
                db.configure(() => new db.MongoStorage("mongodb://mongo:mongo@localhost:27017/"));
                const store = await db.storage.store("fileSystemEntries");
                for await (const fsEntry of Artefact.stream(walk({ path }))) {
                    console.log(`fsEntry=${nodeUtil.inspect(Object.entries(fsEntry))} toData()=${nodeUtil.inspect(Object.entries(fsEntry.toData()))}`);
                    const dbEntry = await store./* findOne */updateOrCreate(fsEntry, fsEntry.query("fileSystem/File.path"), { upsert: true });
                    if (!dbEntry) {
                        throw new MongoError(`Could not updateOrCreate`);
                    }
                    // console.log(`dbEntry=${!dbEntry ? "(falsey)" : nodeUtil.inspect(Object.entries(dbEntry))} toData()=${!dbEntry ? "(falsey)" : nodeUtil.inspect(Object.entries(dbEntry.toData()))}`);
                    // if (!dbEntry.hash) {

                // // }
                    //     }
                    // }
                    console.log(`Closing db.storage=${db.storage}`);
                    await db.storage.close();
                }
            }
        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};
