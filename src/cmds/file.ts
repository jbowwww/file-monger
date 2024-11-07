import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact, ArtefactDependencies, Aspect, AspectPossiblyAbstractCtor, AspectProperties, isArtefactCtor, is } from "../Model";
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

// @notifyPropertyChanges
class FileArtefact extends Artefact {
    constructor(...args: any[]) {
        super();
        // const propertyNames = Object.getOwnPropertyNames(this);
        // console.log(`FileArtefact.ctor: propertyNames=${propertyNames.join(", ")}`);
        return new Proxy(this, {
            set(_, K: string, newValue, receiver) {
                console.log(`FileArtefactProxy.set() 1:  K=${K} _=${_} newValue=${newValue} receiver=${receiver}`);
                const aspect: Aspect = _[K];
                // if (Aspect.prototype.isPrototypeOf(aspect)) {
                _[K] = newValue;
                const dependencies: ArtefactDependencies[] = Reflect.getOwnMetadata("dependencies", _, K);
                console.log(`FileArtefactProxy.set() 2:  K=${K} _=${_} newValue=${newValue} receiver=${receiver}`);
                // }
                return true;
            },
            get(_, K: string | symbol, receiver) {
                K = typeof K === "symbol" ? K.toString() : K;
                const debugOutput = K !== "then" && !K.startsWith("Symbol(") && K !== "toString" && K !== "toData" && K !== "addAspect";
                if (debugOutput) console.log(`FileArtefactProxy.get() 1:  K=${K} _=${_} ... `);//  _[K]=${_[K]}receiver=${JSON.stringify(receiver)}
                // let value = _.getAspect(K);
                // if (!!value) return value;
                const descriptor = Object.getOwnPropertyDescriptor(_/* .prototype */, K);
                const aspectType = Reflect.getMetadata("design:type", _, K) as typeof Aspect;
                const dependencies: ArtefactDependencies | undefined = Reflect.getOwnMetadata("dependencies", _, K);
                let value = descriptor?.value;// ?? _[K];
                if (debugOutput) console.log(`FileArtefactProxy.get() 2: descriptor=${JSON.stringify(descriptor)} aspectType?.name=${aspectType?.name} dependencies=${dependencies} value=${value}`);//  _[K]=${_[K]}receiver=${JSON.stringify(receiver)}
                // if (Object.hasOwn(_, K)) {
                //     
                // }
                // if (!descriptor) throw new TypeError(`FileArtefactProxy.get(): property K=\"${K}\" doesn't exist on _=${_}`);
                if (!!aspectType) {
                    const gotValue = _.getAspect(aspectType);
                    if (!!gotValue) {
                        return gotValue;
                    }
                }
                const innerGetter = dependencies?.getter || descriptor?.get;
                if (!!innerGetter) {
                    const gotValue = innerGetter?.call(_);
                    if (!!gotValue) {
                        _.addAspect(gotValue);
                    }
                    return gotValue;
                }
                value = _[K];
                return typeof value === "function" ?
                    Aspect.isPrototypeOf(value) ? _.getAspect(value as AspectPossiblyAbstractCtor<any>) :
                    (function (...args: any[]) { return (value as Function).apply(/* this === receiver ? target : this */_, args); }) :
                    value;
            }
        });
    }
    FileEntry: FileEntry = null!;
    File: File = null!;
    Directory: Directory = null!;
    // todo: debug this and see if anything (e.g. toData) is calling it
    @FileArtefact.depends('file')
    get hash(): Promise<Hash> | undefined {
        console.log(`FileArtefact.hash(): this=${this}`)
        return /* this.getAspect(Hash) ?? */ !!this.File ? Hash.create({ _: this, path: this.File.path }) : undefined;
    };

    get query() {
        return ({
            unique:
                !!this._id ? { _id: this._id } :
                !!this.getAspect(File) ? { "file.path": this.getAspect(File)!.path } :
                !!this.getAspect(Directory) ? { "directory.path": this.getAspect(Directory)!.path } :
                !!this.getAspect(FileEntry) ? { "fileEntry.path": this.getAspect(FileEntry)!.path } : {},
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
                for await (const fsEntry of FileArtefact.stream(FileEntry.walk(path))) {
                    console.log(`fsEntry1 = ${fsEntry}`);
                    const dbEntry = (await store.updateOrCreate(fsEntry));
                    console.log(`fsEntry2 = ${fsEntry}`);
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
