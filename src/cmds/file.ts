import { Artefact, ArtefactDownstreams, Aspect, AspectPossiblyAbstractCtor, AspectProperties, isArtefactCtor, is, stringify, AnyParameters, AspectCtor, Ctor } from "../Model";
import * as db from '../db';
import { File, Directory, FileEntry as FileSystemEntry, calculateHash } from "../fs";
import yargs, { ArgumentsCamelCase } from "yargs";
import { diff, updatedDiff } from "deep-object-diff";

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

class Hash /* extends Aspect */ {
    sha256?: string;

    constructor({ sha256/* , ...aspect */ }: Partial<Hash>) {
        // super(aspect);
        this.sha256 = sha256;
    }
    
    static /* override */ async create({ /* _, */ path }: { /* _,: Artefact, */ path: string }) {
        const sha256 = await calculateHash(path);
        return new Hash({ /* _, */ sha256 })
    }
}


// type ComputedValueInputCtor<T extends Aspect = Aspect> = Ctor<T>;//<T extends Aspect = Aspect, TArgs extends AnyParameters = AnyParameters> = AspectCtor<T, TArgs>;
// type ComputedValueInputCtors = { [K: number]: ComputedValueInputCtor<Aspect>; };
// type ComputedValueType<T extends ComputedValueInputCtors, K extends number = keyof T? =  = T extends ComputedValueInputCtors ? ComputedValueInputCtor<InstanceType<T[K]>> : never;
// type ComputedValueInputs<T extends ComputedValueInputCtors> = { [K in keyof T as number]: ComputedValueType<T, K>; }

type Arrayish = Array<any> & { [n: number]: unknown; }
type AugmentElements<T extends Arrayish, A> = T & { [n: number]: T[typeof n] & A; };
type Condition<I extends Artefact> = (_: I) => boolean;// (...aspects: AugmentElements<I, undefined>) => boolean;
type Computation<I extends Artefact, O = any> = (_: I) => O | Promise<O> | null | Promise<null>;// (...inputs: AugmentElements<I, undefined>) => O | Promise<O> | null;

// class AsyncComputedValue<I extends Artefact, O = any> {
//     condition: Condition<I> = _ => true;
//     compute: Computation<I, O>;

//     constructor(_: I, compute: Computation<I, O>) {
//         // this.condition = condition;
//         this.compute = compute;
//     }

// }

type ComputedValue<I extends Artefact, O extends any> = O | ((_: ResolvedValues<I>, _previous?: ResolvedValues<I>, previousValue?: File) => (O | undefined));
type AsyncComputedValue<I extends Artefact, O extends any> = O | Promise<O> | ((_: ResolvedValues<I>, _previous?: ResolvedValues<I>, previousValue?: O) => (O | Promise<O> | undefined));
type ResolvedValues<A extends Artefact> = {
    [K in keyof A]: A[K] extends (ComputedValue<A, infer O> | AsyncComputedValue<A, infer O>) ? O/* ReturnType<A[K]> */ : A[K];
};

// @notifyPropertyChanges
class FileSystemArtefact extends Artefact {

    constructor(FileEntry: FileSystemEntry) {
        super();
        this.FileEntry = FileEntry;
    }

    readonly FileEntry: FileSystemEntry;
    readonly File?: ComputedValue<FileSystemArtefact, File> = _ => _.FileEntry as File;
    readonly Directory?: Directory;

    readonly Hash?: AsyncComputedValue<FileSystemArtefact, Hash> | undefined = (_, _previous, previousValue?: Hash) =>
        !!_.File && (!_previous || Object.keys(diff(_, _previous)).includes("File.stats")) ?
            Hash.create({ path: _.File.path }) :
            previousValue
    // readonly Hash?: AsyncComputedValue<FileSystemArtefact, Hash> = (_: FileSystemArtefact) => !!this.File ? Hash.create({ path: this.File!.path }) : undefined;
    // readonly Hash? = new AsyncComputedValue(this, _ => !!_.File ? Hash.create({ path: _.File.path }) : null);

    get query() {
        return ({
            unique:
                !!this._id ? { _id: this._id } :
                // !!this.File ? { "File.path": this.File.path } :
                // !!this.Directory ? { "Directory.path": this.Directory.path } :
                !!this.FileEntry ? { "FileEntry.path": this.FileEntry.path } : {},
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
                const store = await db.storage.store<FileSystemArtefact>('fileSystemEntries');
                for await (const fsEntry of FileSystemArtefact.stream(FileSystemEntry.walk(path))) {
                    console.log(`fsEntry1 = ${fsEntry}`);
                    const dbEntry = (await store.updateOrCreate(fsEntry));
                    console.log(`fsEntry2 = ${fsEntry}`);
                    if (!dbEntry?._.Hash) {

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
