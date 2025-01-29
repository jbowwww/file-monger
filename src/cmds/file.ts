import * as nodeUtil from "node:util";
import * as db from '../db';
import { File, Directory, walk, Hash, Entry, moduleName, isFile, isDirectory, isUnknown, Unknown, compose } from "../models/file-system";
import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact } from '../models';
import { MongoError } from "mongodb";
import {} from "@fieldguide/pipeline"
import { Duplex, pipeline, Readable, Transform } from "node:stream";

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

// class FileArtefact extends Artefact {
//     constructor(private Entry: Entry) { super(); }

//     // Subclasses of Entry
//     public get File(): File | undefined { return isFile(this.Entry) ? this.Entry as File : undefined; }
//     public get Directory(): Directory | undefined { return isDirectory(this.Entry) ? this.Entry as Directory : undefined; }
//     public get Unknown(): Unknown | undefined { return isUnknown(this.Entry) ? this.Entry as Unknown : undefined; }
    
//     public Hash: Hash | undefined;
// }

type FileArtefact = Artefact<{
    File?: File;
    Directory?: Directory;
    Unknown?: Unknown;
    Hash?: Hash;
}>;

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
                const FileArtefactPipeline = compose(
                    // walk({ path })), 
                    (e: Entry) => ({ [e._T]: e }),
                    async ({ File }: { File?: File }) => ({ File, Hash: !!File && await Hash({ path: File?.path }) }),
                    async (_: FileArtefact) => await store.updateOrCreate(_, _.File ? File.query.byPath(_.File.path) : {}, { upsert: true })
                );
                for await (const _ of await FileArtefactPipeline(walk({ path }))) {
                // for await (const fsEntry of /* Artefact.stream */(walk({ path }))) {
                    // const _ = ({ [fsEntry._T]: fsEntry });// new FileArtefact(fsEntry);
                    console.log(`_=${nodeUtil.inspect(_)}`);// toData()=${nodeUtil.inspect(Object.entries(_/* .toData() */))}`);
                    // const dbEntry = await store./* findOne */updateOrCreate(_, File.query.byPath(_.File.path), { upsert: true });
                    // if (!dbEntry) {
                    //     throw new MongoError(`Could not updateOrCreate`);
                    // }
                    // console.log(`dbEntry=${!dbEntry ? "(falsey)" : nodeUtil.inspect(Object.entries(dbEntry))} toData()=${!dbEntry ? "(falsey)" : nodeUtil.inspect(Object.entries(dbEntry.toData()))}`);
                    // if (!dbEntry.hash) {
                }
                // // }
                    //     }
                    // }
                console.log(`Closing db.storage=${nodeUtil.inspect(db.storage)}`);
                await db.storage.close();
            }
        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};
