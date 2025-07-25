import yargs from "yargs";
import { Task } from "../task";
import { DbCommandArgv } from "./db";
import { BulkWriterOptions, MongoStorage, Store } from "../db";
import { MongoError } from "mongodb";
import { tap } from "../pipeline";
import { Artefact, isArtefact } from "../models/artefact";
import * as FS from "../models/file-system";
import * as Audio from "../models/audio";

import debug from "debug";
import * as nodePath from "node:path";
import { Progress } from "../progress";
const log = debug(nodePath.basename(module.filename));

export interface FileCommandArgv {
    paths: string | string[];
}

export type FileSystemArtefact = Artefact & {
    File: FS.File;
    Directory: FS.Directory;

    Unknown: FS.Unknown;

    // Only iff !!this.File
    Hash: FS.Hash;
    Audio: Audio.Audio;
    Disk: FS.Disk;
    Partition: FS.Partition;
};

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

                function hashFiles(task: Task) {
                    return task.repeat({ preDelay: 3000, }, async task => task.pipe(
                        store.find({ $and: [
                            { File: { _T: "File", } },
                            { $or: [ { Hash: { $exists: false } }, { $expr: { $lt: [ "$Hash._ts", "$File.stats.mtime", ] } } ]}, ],
                        }, { progress: task.progress.connect.readWriteTotal }),
                        (_: FileSystemArtefact) => FS.Hash.create(_.File.path),
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
