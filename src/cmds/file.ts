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

class FileArtefact extends Artefact {

    get fileEntry() { return this.getAspect(FileEntry); }// || this.getAspect(File) || this.getAspect(Directory); }
    get file() { return this.getAspect(File); }
    get directory() { return this.getAspect(Directory); }
    
    @dependsOn(['file'])
    get hash() { return this.getAspect(Hash) ?? !!this.file ? this.createAspect(Hash, { path: this.file!.path }) : undefined; };

    static override query(_: FileArtefact) {
        return ({
            unique: !!_._id ? { _id: { $eq: _._id } } :
                _.file ? { "file.path": _.file.path } :
                _.directory ? { "directory.path": _.directory.path } :
                _.fileEntry ? { "fileEntry.path": _.fileEntry.path } : {},
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
