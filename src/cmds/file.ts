import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact, Aspect, AspectProperties } from "../Model";
import * as db from '../db';
import { File, Directory, FileEntry, calculateHash } from "../fs";
import dependsOn from "@justinseibert/depends-on";

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

class FileArtefact {

    public fileEntry: FileEntry;

    @derivedFrom("fileEntry") public file?: File;
    @derivedFrom("fileEntry") public directory?: Directory;
    
    @dependency(['file'])
    get hash(): Promise<Hash> | undefined { return this.getAspect(Hash) ?? !!this.file ? this.createAspect(Hash, { path: this.file?.path }) : undefined; };

    constructor({ fileEntry }: { fileEntry: FileEntry, }) {
        this.fileEntry = fileEntry;
    }
    
    set hash(hash: Hash | undefined) { this.addAspect(hash, Hash); }

    get query() {
        return ({
            unique:
                !!this._id ? { _id: { $eq: this._id } } :
                !!this.file ? { "file.path": this.file.path } :
                !!this.directory ? { "directory.path": this.directory.path } :
                !!this.fileEntry ? { "fileEntry.path": this.fileEntry.path } : {},
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
                    const dbEntry = (await store.updateOrCreate(fsEntry));
                    if (!dbEntry?._.hash) {

                    }
                }
            }
            console.log(`Closing db.storage=${db.storage}`);
            await db.storage.close();

        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};
