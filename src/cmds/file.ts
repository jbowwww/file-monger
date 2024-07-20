import yargs, { ArgumentsCamelCase } from "yargs";
import * as db from '../db';

import { FileSystem, File, Directory, Unknown } from "../models/file4";
import { Artefact } from "../models/Model";

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
        default: CalculateHashEnum.Wait,//.Async,
    },
}

// export type FileSystemArtefactSchema = ArtefactSchema<{
//     File: File,
//     Directory: Directory
// }>;

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

                const store = await db.storage.store('files', {});
                for await (const artefact of Artefact.stream/* <FileSystemArtefactSchema> */( FileSystem.walk(path) )) {
                    console.log(`artefact=${(artefact)}`);
                    await store.findOneAndUpdate(Artefact.query.findOne(artefact), artefact);    //, artefact.File.query.path);

                    // if (argv.calculateHash === CalculateHashEnum.Wait) {
                    //     await store.update(() => artefact.File.calculateHash());
                    // } else if (argv.calculateHash === CalculateHashEnum.Background) {
                    //     store.update(() => artefact.File.calculateHash())
                    // }
                }
            }
            console.log(`Closing db=${db}`);
            await db.close();

        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
//     await db.connect(argv.dbUrl, {});
};
