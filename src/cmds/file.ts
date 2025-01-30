import * as nodeUtil from "node:util";
import * as db from '../db';
import { Entry, File, Directory, Unknown, walk, Hash } from "../models/file-system";
import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact } from '../models';
import {} from "@fieldguide/pipeline"
import { pipeline } from "../pipeline";

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
                db.configure(() => new db.MongoStorage("mongodb://mongo:mongo@localhost:27017/"));
                const store = await db.storage.store("fileSystemEntries");
                const FileArtefactPipeline = pipeline<Entry, FileArtefact>(
                    (e: Entry) => ({ [e._T]: e }),
                    async ({ File }: { File?: File }) => ({ File, Hash: !!File && await Hash({ path: File?.path }) }),
                );
                for await (const _ of FileArtefactPipeline(walk({ path }))) {
                    const fsEntryType = [File, Directory, Unknown].find(T => !!_[T.name as keyof FileArtefact]) ?? Entry;
                    const result = await store.updateOrCreate(
                        _,
                        ({ [`${fsEntryType.name}.path`]: (_[fsEntryType.name as keyof FileArtefact] as Awaited<ReturnType<typeof fsEntryType>>).path }),
                        { upsert: true });
                    console.log(`_=${nodeUtil.inspect(_)} result=${nodeUtil.inspect(result)}`);
                }
                console.log(`Closing db.storage=${db}`);
                await db.storage.close();
            }
        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};
