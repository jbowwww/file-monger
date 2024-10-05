import yargs, { ArgumentsCamelCase } from "yargs";
import * as db from '../db';

import { File, Directory, FileSystem, FileSystemEntry } from "../new/fs";
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

class FileArtefact extends Artefact {
    get fsEntry() { return this.get(FileSystemEntry); }
    get file() { return this.get(File); }
    get dir() { return this.get(Directory); }
    // override getKey() {
    //     return (this._id !== undefined ?
    //         ({ _id: { $eq: this._id } }) :
    //         ({ $or: [
    //             { "file.path": { $eq: this.file?.path } },
    //             { "dir.path": { $eq: this.dir?.path } },
    //         ]}));
    // }
    get query() {
        return ({
            ...super.query,
            byPrimary: () => File.query.byPath(this.fsEntry!.path),
        })
    }
};

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

                const store = await db.storage.store<FileArtefact>('fileSystemEntries');
                for await (const artefact of FileArtefact.stream( FileSystem.walk(path) )) {
                    console.log(`artefact=${(artefact)}`);
                    await store.updateOrCreate(artefact);
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
