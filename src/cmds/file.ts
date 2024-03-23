import yargs from "yargs"
import * as db from '../db';
import fs from 'fs';
import { calculateHash } from "../file";

export interface FileCommandArgv {
    dbUrl: string,
    paths: string[],
}

export interface File {
    path: string,
    stats: fs.Stats
}

// export class File {
//     constructor(file: File) {
//         this.path = file.path;
//         this.stats = Object.assign(new fs.Stats(), file.stats);
//     }
// }
exports.command = 'file';
exports.description = 'File commands';
exports.builder = function (yargs: yargs.Argv<FileCommandArgv>) {
    yargs.command('index <paths...>', 'Index file', yargs => {
        yargs.positional('paths', {
            description: 'Path(s) to file(s) or shell glob expression(s) that will get expanded',
            array: true,
            demandOption: true
        });
    }, async function (argv) {
        for (const path of argv.paths) {
            const stats = await fs.promises.stat(path);
            if (!stats.isFile())
                throw new Error(`Path '${path}' is not a file`);
            else
                process.stdout.write(`File '${path}'`);
            await db.runCommand(argv.dbUrl, {}, async db => {
                const coll = db.collection<File>('local');
                const file = await coll.findOne({ path: path });
                let doHash = true;
                if (file) {
                    if (file.stats.size == stats.size || file.stats.mtimeMs == stats.mtimeMs) {
                        console.log(`File '${path}' matches local DB: ${JSON.stringify(file)}`);
                        doHash = false;
                    } else {
                        console.log(`File '${path}' does not match local DB: ${JSON.stringify(file)}\n\tFile.stat=${JSON.stringify(stats)}`);
                    }
                } else {
                    console.log(`File '${path}' not present in local DB stat=${JSON.stringify(stats)}`);
                }
                if (doHash) {
                    process.stdout.write(`Calculating hash for file '${path}' ... `)
                    const hash = await calculateHash(path);
                    await coll.updateOne({ path }, { $set: { path, stats, hash } }, { upsert: true });
                    console.log(hash);
                }
                console.log();
            });
        }
    })
    yargs.demandCommand();
};
