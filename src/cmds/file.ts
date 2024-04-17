import yargs, { ArgumentsCamelCase } from "yargs"
import * as db from '../db';

import { calculateHash } from "../file";
import { Collection, WithId } from "mongodb";

import { File, Directory, FileSystem } from "../models/file";

export interface FileCommandArgv {
    dbUrl: string,
    paths: string[],
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
            // await db.useConnection(argv.dbUrl, {}, async connection => {
            //     const coll = connection.db().collection<File>('local');
            //     const file = await File.findOrCreateFromPath(path, coll);
            // });
            // await db.connect(argv.dbUrl);
            const store = new db.Store(File, 'files');
            for await (const fileSystemEntry of FileSystem.walk(path)) {
                if (fileSystemEntry instanceof File)
                    await fileSystemEntry.updateOrCreate(store);
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
