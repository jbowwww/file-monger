import yargs from "yargs";
import * as db from '../db';

import { File, Directory, FileSystem } from "../models/file";
import { Artefact, ArtefactSchema } from "../models/base/Artefact2";
import { Dir } from "fs";

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

export type FileSystemArtefactSchema = ArtefactSchema<{
    File: File,
    Directory: Directory
}>;

export const command = 'file';
export const description = 'File commands';
export const builder = function (yargs: yargs.Argv<FileCommandArgv>) {
    yargs.command('index <paths...>', 'Index file', yargs => {
        yargs.positional('paths', {
            description: 'Path(s) to file(s) or shell glob expression(s) that will get expanded',
            array: true,
            demandOption: true
        });
    }, async function (argv): Promise<void> {
        for (const path of argv.paths) {

            const store = await db.storage.store('files', {});
            for await (const artefact of Artefact.stream<FileSystemArtefactSchema>( FileSystem.walk(path) )) {
                
                await store.findOneAndUpdate({ File: artefact.query.byPrimary() }, artefact);    //, artefact.File.query.path);

                if (argv.calculateHash === CalculateHashEnum.Wait) {
                    await store.update(() => artefact.File.calculateHash());
                } else if (argv.calculateHash === CalculateHashEnum.Background) {
                    store.update(() => artefact.File.calculateHash())
                }
            }
            await db.close();
        }
    })
    yargs.demandCommand();
};

// exports.handler = async function (argv: ArgumentsCamelCase<FileCommandArgv>) {
//     console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
//     await db.connect(argv.dbUrl, {});
// };
