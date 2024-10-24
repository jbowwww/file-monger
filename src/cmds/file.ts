import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact, Aspect, AspectProperties } from "../Model";
import * as db from '../db';
import { File, Directory, FileEntry, calculateHash } from "../fs";

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

class Hash extends Aspect {
    sha256?: string;

    constructor({ sha256, ...aspect }: AspectProperties<Hash>) {
        super(aspect);
        this.sha256 = sha256;
    }
    
    static override async create({ _, path }: { _: Artefact, path: string }) {
        const sha256 = await calculateHash(path);
        return new Hash({ _, sha256 })
    }
}

class FileArtefact extends Artefact {
    get fileEntry() { return this.getAspect(FileEntry) || this.getAspect(File) || this.getAspect(Directory); }
    get file() { return this.getAspect(File); }
    get directory() { return this.getAspect(Directory); }
    get hash() { return this.getAspect(Hash) ?? this.file ? this.createAspect(Hash, { path: this.file.path }) : undefined; };

    get query() {
        return ({
            unique: () => !!this._id ? { _id: { $eq: this._id } } :
                this.file ? { "file.path": this.fileEntry?.path } :
                this.directory ? { "directory.path": this.fileEntry?.path } :
                this.fileEntry ? { "fileEntry.path": this.fileEntry?.path } : {},
        });
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
                const store = await db.storage.store<FileArtefact>('fileSystemEntries');
                for await (const fsEntry of FileArtefact.stream(FileEntry.walk("."))) {
                    const dbEntry = await store.updateOrCreate(fsEntry);
                    if (!dbEntry.hash) {

                    }
                }
            }
            console.log(`Closing db.storage=${JSON.stringify(db.storage)}`);
            await db.storage.close();

        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};
