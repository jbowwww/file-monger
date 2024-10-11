import yargs, { ArgumentsCamelCase } from "yargs";
import * as db from '../db';

import { File, Directory, FileSystem, FileSystemEntry, calculateHash } from "../fs";
import { Artefact, Aspect, AspectProperties } from "../Model";

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

export interface HashProps {
    sha256?: string;
};

class Hash extends Aspect implements HashProps {
    sha256?: string;
    constructor({ sha256, ...aspect }: AspectProperties<HashProps>) {
        super(aspect);
        this.sha256 = sha256;
        if (!sha256) {
            this.runAsync(async () => {
                this.sha256 = await calculateHash(this._.getAspect(File)?.path);
            });
        }
    }
}

// export interface HashProps {
//     sha256?: string;
// };

// // TODO: I want to make a utility function that removes the need to declare each property with a null-coalescing operator, like sha256: sha256 ?? await calc....()
// export const Hash = async ({ _, sha256 }: AspectProperties<HashProps>) => ({
//     _,
//     sha256: sha256 ?? await calculateHash(_.getAspect(File)?.path),
// });

class FileArtefact extends Artefact {
    get fileEntry(): FileSystemEntry { return this.getAspect(FileSystemEntry) || this.getAspect(File) || this.getAspect(Directory); }
    get file(): File { return this.getAspect(File); }
    get directory(): Directory { return this.getAspect(Directory); }
    async hash() {
        const task = async () => new Hash({ _: this, sha256: await calculateHash(this.file.path) });
        if ((this.file.stats?.size ?? 0) < (1024*1024)) {
            return await this.runForeground(task);
        } else {
            this.runBackground(task);
        }
    }
    query = {
        unique: () => this.constructor.prototype.query.unique() ?? ({ "file.path": this.file.path })
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
                const store = await db.storage.store<FileArtefact>(FileArtefact, 'fileSystemEntries');
                for await (const fsEntry of FileArtefact.stream(FileSystem.walk("."))) {
                    const dbEntry = await store.updateOrCreate(fsEntry);
                    if (!dbEntry.hash) {

                    }
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
