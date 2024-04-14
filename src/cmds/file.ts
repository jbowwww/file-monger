import yargs from "yargs"
import * as db from '../db';

import { calculateHash } from "../file";
import { Collection, WithId } from "mongodb";

import { File } from "../models/file";

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
            const store = new db.Store(File, 'files');
        }
    })
    yargs.demandCommand();
};
