import yargs from "yargs";
import { Task } from "../task";
import { DbCommandArgv } from "./db";
import { TaskFn } from "../task";
import { BulkOp, BulkOpNames, BulkWriterOptions, MongoStorage, Query as Q, Store } from "../db";
import { MongoError, ObjectId } from "mongodb";
import { PipelineSourceLengthWrapped, tap } from "../pipeline";
import { Artefact, isArtefact, TimestampTree } from "../models/artefact";
import * as FS from "../models/file-system";
import * as Audio from "../models/audio";

import debug from "debug";
import * as nodePath from "node:path";
import { Progress } from "../progress";
import { AspectParameters, DataProperties, DiscriminatedModel } from "../models";
const log = debug(nodePath.basename(module.filename));

export interface FileCommandArgv {
    paths: string | string[];
}

export type FileArtefact = {
    File: FS.File;
    Hash: FS.Hash;  // Only iff !!this.File
    Audio: Audio.Audio;
};
export type DiskArtefact = {
    Disk: FS.Disk;
};
export type PartitionArtefact = {
    Partition: FS.Partition;
}
// export type FileSystemArtefact = Artefact & ( |  | 
export type DirectoryArtefact = {
    Directory: FS.Directory;
};
export type UnknownArtefact = {
    Unknown: FS.Unknown;
};

export class FSArtefact<T extends {}> implements Artefact {
    isArtefact: true = true;
    _id?: ObjectId | undefined;
    _v: number = 0;
    _ts: TimestampTree<T> = new ;
    _e?: Error[] | undefined;
    constructor(data: DataProperties<FSArtefact>) {

    }

}

export type TaskFnConfig<A extends Artefact, K extends keyof A = keyof A> = {
    store: Store<A>;
    input: PipelineSourceLengthWrapped<A>;//[K];
    op: BulkOpNames;
    task: TaskFn<[A], A[keyof A]>;
    repeatPreDelay?: number;
    repeatPostDelay?: number;
}

export type TaskFnConfigs<A extends Artefact> = {
    [K in keyof A]: TaskFnConfig<A, K>;
};

const Artefact = {
    Tasks: <A extends Artefact>(...taskFns: TaskFnConfig<A>[]) => Task.runAll(
        ...taskFns.map(taskConfig => (task: Task) => task.repeat({
            preDelay: taskConfig.repeatPreDelay,
            postDelay: taskConfig.repeatPostDelay,
        }, task => task.pipe(
            taskConfig.input,
            taskConfig.store.ops["insertOne"],//taskConfig.op],
            task.progress.pipeCounter,
            taskConfig.store.bulkWriterSink()
        ))),
};

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
            const store = await storage.store<FileSystemArtefact>("fileSystemEntries", {
                createIndexes: [{
                    index: { "File.path": 1, "Directory.path": 1, "Unknown.path": 1, "Partition.uuid": 1, "Disk.model": 1, "Disk.serial": 1, },
                    options: { unique: true, },
                }],
            });

            // const FsArtefactDesign = (entry: FS.File | FS.Directory | FS.Unknown) => ({ [entry._T]: entry, });
            //     indexFileSystem
            // };

            await Task.runAll(

                function enumerateBlockDevices(task: Task) {
                    return task.repeat({ postDelay: 15000 },
                        async task => task.pipe(
                            task.progress.setTotalFromSource([
                                ...(await FS.Disk.getAll() as (FS.Disk | FS.Partition)[]),
                                ...(await FS.Partition.getAll())
                            ], _ => _.length),
                            store.ops.updateOne,
                            task.pipeLogger(log),
                            task.progress.pipeCounter,
                            store.bulkWriterSink()));
                },

                function indexFileSystem(task: Task) {
                    let indexTaskId = 0;
                    const paths = Array.isArray(argv.paths) ? argv.paths : argv.paths.split(" ");
                    return task.runAll(...paths.map((path, searchId) =>
                        async (task: Task) => task.repeat({ postDelay: 180000, },
                            async (task: Task) => task.pipe(
                                FS.walk({ path, progress: task.progress.connect.readWriteTotal }),//[FS.walk, { path }],
                                store.ops.updateOne,
                                task.progress.pipeCounter,
                                store.bulkWriterSink({ progress: task.progress }),
                            ))));
                },
                
                // different syntax ideas
                // ({ exists, and, or, lt, lte, gt, gte }) => and(exists(FS.File), or(exists(FS.Hash), lt("$Hash._ts", "$File.stats.mtime")))
                // Q => Q.and(Q.exists(FS.File), Q.or(Q.exists(FS.Hash), Q.lt("$Hash._ts", "$File.stats.mtime")))
                // Q.exists(FS.File).and(Q.exists(FS.Hash).or(Q.lt("$Hash._ts", "$File.stats.mtime"))))
                // Q.and(Q(FS.File).exists(), Q.or(Q(FS.Hash).exists(false), Q.expr.lt("$Hash._ts", "$File.stats.mtime"))
                // Q(FS.File).exists().and(Q(FS.Hash).exists(false).or(Q.expr.lt("$Hash._ts", "$File.stats.mtime"))
                
                function hashFiles(task: Task) {
                    return task.repeat({ preDelay: 3000, }, async task => task.pipe(
                        store.find( Q.and(
                            Q(FS.File).exists(),
                            Q.or( Q(FS.Hash).exists(false), Q.expr.lt("$Hash._ts", "$File.stats.mtime"))
                        ), {  progress: task.progress.connect.readWriteTotal }),
                        ({ File, Hash }: FileSystemArtefact) => ({ Hash: FS.Hash.create(File.path),
                        store.ops.updateOne,
                        task.progress.pipeCounter,
                        store.bulkWriterSink()));     // 3 seconds
                },

                function analyzeAudioFiles(task: Task) {
                    return task.repeat({ preDelay: 3000, }, async task => task.pipe(
                        store.find({ $and: [
                            { File: { $exists: true } },
                            { $or: Audio.fileExtensions.map(ext => ({ "File.path": { $regex: "\^.*\\." + ext + "$", $options: "i" } })) },
                            { $or: [ { Audio: { $exists: false } }, { "Audio._ts": { $lt: "$File.stats.mtime" } }, ]}, ],
                        }, { progress: task.progress.connect.readWriteTotal }),
                        async (_: FileSystemArtefact) => await Audio.Audio.create(_.File!.path),
                        store.ops.updateOne,
                        task.progress.pipeCounter,
                        store.bulkWriterSink({ ...BulkWriterOptions.default, progress: task.progress })));
                }            
            );
        }
    ).demandCommand();

async function handleError(e: Error, task: Task, _: Partial<FileSystemArtefact | FS.Entry>, store: Store<FileSystemArtefact>) {
    // const error = Object.assign(e, { task: task });//new Error("${task.name}: Error!\n_=${nodeUtil.inspect(_, false, 1)}\nError={e/* .stack */}"), { /* cause: e, stack: e.stack */ });
    if (!(e instanceof MongoError)) {
        const result = await store.updateOne(
            FS.Entry.is(_) ? ({ [`${_._T}.path`]: _.path }) :
            isArtefact<FileSystemArtefact>(_) ? (_._id ? { _id: _._id } :
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
