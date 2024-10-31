import yargs, { ArgumentsCamelCase } from "yargs";
import { Aspect, AspectProperties, Ctor, Queries } from "../Model";
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
    
    static override async create(path: string) {
        const sha256 = await calculateHash(path);
        return new Hash({ _: undefined, sha256 })
    }
}

class Ashpect<T, A> {
    #value: T;

    constructor(initialValue: T, dependencies: string[], get: (this: A) => T | Promise<T | undefined>) {
        this.#value = initialValue;
    }

    valueOf() {
        return this.#value;
    }
}

// }= <A>(dependencies: string[], get: (this: A) => Promise<A>) => function onDecorator() {

// };
type ArtefactType<T extends Aspect> = { [K: string]: Ctor<T> | Ashpect<T, ArtefactPropertyTypes>; };
type ArtefactPropertyType<T> = T extends Ctor<infer A> ? A : T extends [string[], () => infer A] ? A : never;
type ArtefactPropertyTypes<P extends Aspect = Aspect> = { [K in keyof P]: ArtefactPropertyType<P[K]>; }

// const makeFileArtefact = Object.assign(
    function makeFileArtefactType<A, T extends ArtefactType>(
        artefactProperties: InstanceType<A>,
        artefactCreator: (artefactProps: Partial<ArtefactPropertyTypes<InstanceType<A>>>) => ArtefactPropertyTypes<InstanceType<A>>
    ) {
        return function FileArtefact(artefact: Partial<ArtefactPropertyTypes<InstanceType<A>>> = {}) {
            const artefactSchema = artefactCreator(artefact);
            return new Proxy(artefact, {
                get(_: ArtefactPropertyTypes<InstanceType<A>>, K: string, receiver: ArtefactPropertyTypes<InstanceType<A>>) {
                    return Array.isArray(artefactProperties[K]) && artefactProperties[K].length === 2 ?
                        artefact[K] ?? artefactProperties[K][1]() : artefact[K];
                },
                set(_: ArtefactPropertyTypes<InstanceType<A>>, K: string, newValue: any/* ArtefactPropertyTypes<A>[typeof K] */, receiver: ArtefactPropertyTypes<InstanceType<A>>) {
                    const valueCtor = newValue?.constructor;
                    const artefactProp = (Array.isArray(artefactProperties[K]) && artefactProperties[K].length === 2 ?
                        artefactProperties[K][0] : artefactProperties[K]) as Ctor<Aspect>;
                    if (valueCtor !== artefactProp)
                        throw new TypeError(`valueCtor=${valueCtor.name} !== artefactProperties["${K}"]=${artefactProp?.name}`);
                    return true;
                }
            });
        };
    }


    const FileArtefact = makeFileArtefactType({
        fileEntry: FileEntry,
        file: File,
        directory: Directory
    }, function ({ fileEntry, file, directory, hash }: Partial<{ fileEntry: FileEntry, file: File, directory: Directory, hash: Hash }>) { return ({
        fileEntry: fileEntry,
        file: file,
        directory: directory,
                
        hash: new Ashpect(hash, ["file.stats"], async (): Promise<Hash | undefined> => Hash.create(file?.path ?? "")),
                // hash = hash//(): Promise<Hash | undefined> { return Hash.create((await this.file)?.path ?? ""); },

        async query() {
            return ({
                unique:
                    !!this._id ? { "_id": this._id } :
                    !!file ? { "file.path": (await this.file).path } :
                    !!this.directory ? { "directory.path": (await this.directory).path } :
                    !!this.fileEntry ? { "fileEntry.path": (await this.fileEntry).path } : undefined,
            });
        }
    }); });

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
