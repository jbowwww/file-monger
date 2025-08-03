import yargs from "yargs";
import { Task, TaskOptions, TaskPipeOptions, TaskRepeatOptions } from "../task";
import { DbCommandArgv } from "./db";
import { TaskFn } from "../task";
import { BulkOp, BulkOpFnMap, BulkOpNames, BulkWriterOptions, MongoStorage, Query as Q, Store } from "../db";
import { AnyBulkWriteOperation, MongoError } from "mongodb";
import { merge, PipelineInput, PipelineSink, PipelineSourceLengthWrapped } from "../pipeline";
import { Artefact, isArtefact } from "../models/artefact";
import { ArtefactSchema, } from "../models/artefact";
// import { ArtefactSchema } from "../models/file-system";
import * as FS from "../models/file-system";
import * as Audio from "../models/audio";
import { Aspect, AspectType, AspectTypeOrName } from "../models";

import debug from "debug";
import * as nodePath from "node:path";
const log = debug(nodePath.basename(module.filename));

// /* export */ interface ArtefactSchema {}
export interface FileCommandArgv {
    paths: string | string[];
}

export type FileArtefact = {
    File: FS.File;
    Hash: FS.Hash;  // Only iff !!this.File
    Audio: Audio.Audio;
};
export const isFileArtefact = (value: any): value is FileArtefact => value?.File?._T === FS.File._T;
export type DiskArtefact = {
    Disk: FS.Disk;
};
export type PartitionArtefact = {
    Partition: FS.Partition;
}
export type FileSystemArtefact = Artefact & (DiskArtefact | PartitionArtefact | FileArtefact | DirectoryArtefact | UnknownArtefact)
export type DirectoryArtefact = {
    Directory: FS.Directory;
};
export type UnknownArtefact = {
    Unknown: FS.Unknown;
};

// export class Artefact<T extends { [K: string]: any; }> {
//     isArtefact: true = true;
//     _id?: ObjectId | undefined;
//     _v: number = 0;
//     _ts: TimestampTree<Partial<T>>;
//     _e?: Error[] | undefined;
//     constructor(data?: Partial<T>) {
//         if (data) {
//             Object.assign(this, data);
//         }
//         this._ts = data ? makeTimestampTree(data) : {} as TimestampTree<Partial<T>>;
//     }
// }

// export class FSArtefact extends Artefact<FSArtefact> {
//     constructor(data: Partial<FSArtefact>) {
//         super();
//     }
// }

// export type FSArtefactSchema<T extends {}, P extends Aspect> = FS.File | FS.Directory | FS.Unknown> = {
//     Entry: FS.Entry;
    
// };

// might still use this if POJO's with methods that use "this." to access other model data
export type ModelResolveFn = <A extends Aspect>(aspectTypeOrName: AspectTypeOrName<A>) => A;

// export type Model = Record<PropertyKey, 
export type ModelDefinitionFn<I, A> = (input: I) => A;

export type DataMemberFn<M extends ArtefactModel/* <M> */, A extends Aspect> = (_: M) => A | Promise<A>;
export type ArtefactModel = { [K: string]: AspectType | DataMemberFn<ArtefactModel, Aspect>; };
// Possible/useful to wrap this async gen* with a length property a la FS.walk, store.find() ?
export type ArtefactObjectParameter<M extends ArtefactModel> = {
    [K in keyof M]: M[K] extends AspectType ? M[K] : M[K] extends DataMemberFn<M, any> ? ReturnType<M[K]> : never;
};
export type ArtefactDbOpsStream<M extends ArtefactModel> = (store: Store<Artefact & M>) => AsyncGenerator<BulkOp<M>>;
export type ArtefactData<M extends ArtefactModel, A extends Artefact> = (data: Partial<A>) => A;
// export const ArtefactModel = <M extends ArtefactModel, A extends Artefact>(model: M): ArtefactData<M, A> => new Artefact;//ArtefactDbOpsStream<M> => merge());

// withOUT usinig a ModelResolveFn like above, i think i either need to separately & explicitly define dependencies between members,
// or dependencies can be determined automagically if each data function member of a model is called passing a "this" that is
// either a carefully constructed dummy object (needs to know what other members exist) or failing that, a proxy, that returns
// (optionally a Promise but still synchronously returned) a dummy piece of data, but stores the dependencies referenced
// by each data function member

// export const FSArtefactModel = ArtefactModel({     //(data: FS.Entry) => ({ [data._T]: data, })
//     File: FS.File,
//     Hash: (_: typeof FSArtefactModel) => await FS.Hash.create(_.File.path) //("File", FS.File)
//         // ._ => FS.calculateHash(_(FS.File).
//         // depends: ["File"],

//     }
// );

// export type ArtefactSchema<T extends {}> = {
//     [K in keyof T]: T[K] extends Function ? ReturnType<T[K]> : 
// };

export type TaskFnConfig<I extends A | Aspect, A extends ArtefactSchema, K extends keyof A = keyof A> = {
    name: string;
    store: Store<A>;
    input: PipelineInput<I>;
    op: BulkOpNames;
    writer: PipelineSink<AnyBulkWriteOperation<A>>,
    repeatPreDelay?: number;
    repeatPostDelay?: number;
}

export type TaskFnConfigs<A extends ArtefactSchema, I extends Aspect | A = A> = {
    [K in keyof A]: TaskFnConfig<I, A>;
};

const Artefact =
    <I extends Aspect | A, A extends ArtefactSchema>
    (commonOptions: Partial<Omit<TaskFnConfig<I, A>, "task">>) => ({
        Tasks: (...taskFns: Partial<TaskFnConfig<I, A>>[]) => Task.runAll(
            ...taskFns
                .map<TaskFnConfig<I, A>>(taskConfig => ({ ...commonOptions, ...taskConfig } as TaskFnConfig<I, A>))
                .map(taskConfig => (task: Task<[A]>) =>
                    task.repeat({
                        preDelay: taskConfig.repeatPreDelay,
                        postDelay: taskConfig.repeatPostDelay,
                    }, task => task.pipe(
                        taskConfig.input,
                        taskConfig.store.ops[taskConfig.op],
                        task.progress.pipeCounter,
                        taskConfig.store.bulkWriterSink()
                    )))),
});

// export function ArtefactSchema() {}

// export const FsSchema = new ArtefactSchema(FS.EntryFS.File, FS.Hash, Audio.Audio);    // First is primary/required, following args are optional?
// S.Directory, FS.Unknown] {
//         type: FS.File
// }
export const command = 'file';
export const description = 'File commands';
export const builder = (yargs: yargs.Argv<DbCommandArgv & FileCommandArgv>) => yargs
    .command('index <paths...>', 'Index file', yargs => yargs
        .positional('paths', {
            type: "string",
            description: 'Path(s) to file(s) or shell glob expression(s) that will get expanded',
            array: true,
            demandOption: true,
        }),
        async (argv: DbCommandArgv & FileCommandArgv) => {
            const storage = new MongoStorage(argv.dbUrl);
            const store = await storage.store<ArtefactSchema>/* FileSystemArtefact */("fileSystemEntries", {
                createIndexes: [{
                    index: { "File.path": 1, "Directory.path": 1, "Unknown.path": 1, "Partition.uuid": 1, "Disk.model": 1, "Disk.serial": 1, },
                    options: { unique: true, },
                }],
            });

            const makeSlice = <A extends Artefact>({ taskOptions, source, op, writer }: {
                taskOptions: TaskOptions & TaskPipeOptions & TaskRepeatOptions;
                source: PipelineInput<A>;
                op: BulkOpFnMap[keyof BulkOpFnMap];
                writer: PipelineSink<BulkOp<A>>;
            }) => (task: Task) => task.repeat(taskOptions, task => task.pipe(
                source, op, task.pipeLogger(log), task.progress.pipeCounter, writer
            ));

            // const FsArtefactDesign = (entry: FS.File | FS.Directory | FS.Unknown) => ({ [entry._T]: entry, });
            //     indexFileSystem
            // };
            Artefact({ store, op: "updateOne", writer: store.bulkWriterSink() }).Tasks({ 
                name: "enumerateBlockDevices",
                repeatPostDelay: 15000,
                input: [
                    ...(await FS.Disk.getAll() as (FS.Disk | FS.Partition)[]),
                    ...(await FS.Partition.getAll())
                ],
            });

            Artefact({ store }).Tasks(
                ...(Array.isArray(argv.paths) ? argv.paths : argv.paths.split(" ")).map((path, searchId) => ({
                    name: `indexFileSystem#${searchId}`,
                    input: FS.walk({ path }),//[FS.walk, { path }],
                })), {
                    name: `hashFiles`,
                    input: store.find( Q.and(
                        Q(FS.File).exists(),
                        Q.or( Q(FS.Hash).exists(false), Q.expr.lt("$Hash._ts", "$File.stats.mtime"))
                    )),
                }, {
                    name: "analyzeAudioFiles",
                    repeatPreDelay: 3000,
                    input: store.find({ $and: [
                        { File: { $exists: true } },
                        { $or: Audio.fileExtensions.map(ext => ({ "File.path": { $regex: "\^.*\\." + ext + "$", $options: "i" } })) },
                        { $or: [ { Audio: { $exists: false } }, { "Audio._ts": { $lt: "$File.stats.mtime" } }, ]}, ],
                    }),
                }            
            );
        }
    ).demandCommand();

async function handleError(e: Error, task: Task, _: Partial<ArtefactSchema | FS.Entry>, store: Store<FileSystemArtefact>) {
    // const error = Object.assign(e, { task: task });//new Error("${task.name}: Error!\n_=${nodeUtil.inspect(_, false, 1)}\nError={e/* .stack */}"), { /* cause: e, stack: e.stack */ });
    if (!(e instanceof MongoError)) {
        const result = await store.updateOne(
            FS.Entry.is(_) ? ({ [`${_._T}.path`]: _.path }) :
            isArtefact<ArtefactSchema>(_) ? (_._id ? { _id: _._id } :
            _.File ? { "File.path": _.File.path } :
            _.Directory ? { "Directory.path": _.Directory.path } :
            _.Unknown ? { "Unknown.path": _.Unknown?.path } :
            _.Partition ? { "Partition.uuid": _.Partition?.uuid } :
            _.Disk ? { $and: [ { "Disk.model": _.Disk.model }, { "Disk.serial": _.Disk?.serial }, ], } :
            _.Hash ? { "Hash.sha256": _.Hash.sha256 } :
            ({ "$eq": _ })) : ({}),
            { $set: { _e: [e] } });
        task.warnings.push(e);
        log("%s: Warn! _=%O Error=%s", task.name, _, e.stack);
    } else {
        task.errors.push(e);
        log("%s: Error! _=%O Error=%s", task.name, _, e.stack);
        throw e;
    }
}
