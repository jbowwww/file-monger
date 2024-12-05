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

@Artefact.notifyPropertyChanges()
class FileSystemArtefact extends Artefact {

    constructor(FileEntry: FileSystemEntry) {
        super();
        this.FileEntry = FileEntry;
    }

    FileEntry: FileSystemEntry;
    readonly File?: File;// ComputedValue<FileSystemArtefact, File> = _ => _.FileEntry as File;
    readonly Directory?: Directory;

    @Artefact.asyncComputedValue(["File.stats"],
        (_, _previous) => !!_.File && (!_previous || Object.keys(diff(_, _previous)).includes("File.stats")),
        (_, _previous) => Hash.create({ path: _.File!.path }))
    accessor Hash: Hash | undefined = undefined;
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
                for await (const fsEntry of FileSystemArtefact.stream(FileSystemEntry.walk(path), (_, e) => _.FileEntry = e)) {
                    const dbEntry = (await store.updateOrCreate(fsEntry));
                    console.log(`\ndbEntry = ${JSON.stringify(dbEntry)}`);
                    if (!dbEntry?._.File/* Entry */) {

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
