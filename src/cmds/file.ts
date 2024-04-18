import yargs, { ArgumentsCamelCase } from "yargs"
import * as db from '../db';

import { calculateHash } from "../file";
import { Collection, WithId } from "mongodb";

import { File, Directory, FileSystem } from "../models/file";
import { Artefact, ArtefactAspect, ArtefactAspects } from "../models/base/Artefact2";
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

export const command = 'file';
export const description = 'File commands';
export const builder = function (yargs: yargs.Argv<FileCommandArgv>) {
    yargs.command('index <paths...>', 'Index file', yargs => {
        yargs.positional('paths', {
            description: 'Path(s) to file(s) or shell glob expression(s) that will get expanded',
            array: true,
            demandOption: true
        });
    }, async function (argv) {
        for (const path of argv.paths) {

            const store = new db.Store</* {
                File: File,
                Directory: Directory,
            } */>('files');

            // This approach might come together. Keep experimenting
            
            for await (const artefact of Artefact.stream<{
                File: File,
                Directory: Directory,
                Error: Error
            }>(
                FileSystem.walk(path)
            )) {
                await store.updateOrCreate(artefact, { File: { path: artefact.File.path } });
                
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
