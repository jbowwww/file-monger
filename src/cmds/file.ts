import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact, Aspect, AspectProperties, Queries } from "../Model";
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
    
    static override async create(path: string) {
        const sha256 = await calculateHash(path);
        return new Hash({ _: undefined, sha256 })
    }
}

class Ashpect<C, T, A> {
    #value: T;

    constructor(container: C, initialValue: T, dependencies: string[], get: (this: A) => T | Promise<T | undefined>) {
        this.#value = initialValue;
    }

    valueOf() {
        return this.#value;
    }
}

// }= <A>(dependencies: string[], get: (this: A) => Promise<A>) => function onDecorator() {

// };

// const makeFileArtefact = Object.assign(
    function FileArtefact({ _id, fileEntry, file, directory, hash }/* _ */: Partial<{ _id: string, fileEntry: FileEntry, file: File, directory: Directory, hash: Hash }>) {
        const self = new Proxy(class FileArtefact {
                _id = _id;
                fileEntry = fileEntry//: Promise<FileEntry>,// || this.getAspect(File) || this.getAspect(Directory); }
                file = file//: Promise<File>,
                directory = directory//: Promise<Directory>,
                
                hash = new Ashpect(this, hash, ["file.stats"], async function hash(this: FileArtefact): Promise<Hash | undefined> { return Hash.create((await this.file)?.path ?? ""); })
                // hash = hash//(): Promise<Hash | undefined> { return Hash.create((await this.file)?.path ?? ""); },

                async query(): Promise<Queries<typeof self>> {
                    return ({
                        unique:
                            !!this._id ? { "_id": this._id } :
                            !!this.file ? { "file.path": (await this.file).path } :
                            !!this.directory ? { "directory.path": (await this.directory).path } :
                            !!this.fileEntry ? { "fileEntry.path": (await this.fileEntry).path } : {},
                    });
                }
            }, {
                get(_, K, receiver) {
                    
                } ,
            }
        );
    }
// );

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
