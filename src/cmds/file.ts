import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { MongoStorage, Store } from "../db";
import exitHook from "async-exit-hook";
import * as Audio from "../models/audio";
import * as nodePath from "node:path";
import { AnyBulkWriteOperation, MongoError } from "mongodb";

import debug from "debug";
import { Artefact } from "../models/artefact";
import { DiscriminatedModel } from "../models";
import { PipelinePromise } from "node:stream";
import * as FS from "../models/file-system";
const log = debug(nodePath.basename(module.filename));

export type FileSystemSchema = DiscriminatedModel<FS.Disk | FS.Partition | FS.File | FS.Directory | FS.Unknown | FS.Hash>;
export type FileSystemArtefactSchema = Artefact<FileSystemSchema>;

export const FileSystemArtefact = Artefact.Type({
    file: FS.File,
    hash: FS.Hash,
    audio: Audio.Audio,
}, (e: Entry) => ({ [e.constructor.name as "file"]: e as FS.File }));

export const DirectoryArtefact = Artefact.Type({
    directory: FS.Directory,
}, (e: Entry) => ({ [e.constructor.name]: e as FS.Directory }));

export const UnknownArtefact = Artefact.Type({
    unknown: FS.Unknown,
}, (e: Entry) => ({ [e.constructor.name]: e as FS.Unknown }));

// export type FileSystemArtefact = { [K in keyof typeof FileSystemArtefact]: Awaited<ReturnType<typeof FileSystemArtefact[K]>>; };


export const command = 'file';
export const description = 'File commands';
export const builder = (yargs: yargs.Argv) => yargs
    .options(globalOptions)
    .command('index <paths...>', 'Index file', yargs => yargs

        .positional('paths', {
            type: "string",
            description: 'Path(s) to file(s) or shell glob expression(s) that will get expanded',
            array: true,
            demandOption: true
        }),

        async function (argv): Promise<void> {

            const storage = new MongoStorage(argv.dbUrl);
            const store = await storage.store<FileSystemArtefactSchema>("fileSystemEntries", {
                createIndexes: [{
                    index: { "File.path": 1, "Directory.path": 1, "Unknown.path": 1, "Partition.uuid": 1, "Disk.model": 1, "Disk.serial": 1, },
                    options: { unique: true, },
                }],
            });//.bulkWriterStore();

            exitHook(async (cb) => {
                log("Exiting ...");
                if (!!storage && storage.isConnected()) {
                    await storage.close();
                }
                cb();
            });

            await Task.start(

                async function enumerateBlockDevices(task: Task) {
                    await Task.repeat({ postDelay: 5000 }, async() => {           // 5s
                        const disks = await FS.Disk.getDisks();
                        const partitions = await FS.Partition.getAll();
                        const ops: AnyBulkWriteOperation<FileSystemArtefactSchema>[] = [];
                        ops.push(...disks.map(d => ({ "updateOne": {
                            filter: { $and: [ { "Disk.model": { $eq: d.model } }, { "Disk.serial": { $eq: d.serial } }, ], },
                            update: { $set: { "Disk": d } },
                            upsert: true,
                        } })));
                        ops.push(...partitions.map(p => ({ "updateOne": {
                            filter: { "Partition.uuid": { $eq: p.uuid } },
                            update: { $set: { "Partition": p } },
                            upsert: true,
                        } })));
                        store.bulkWrite(ops);
                    });
                },

                async function indexFileSystem(task: Task) {
                    await Task.repeat({ postDelay: 180000/*0*/, }, async () => {   // 3/*0*/ minutes
                        for (const path of argv.paths) {
                            for await (const fsEntry of walk({ path, progress: task.progress })) {
                                const _ = { [fsEntry._T]: fsEntry, };
                                try {
                                    log("%s: _=%O", task.name, _);
                                    const result = await store.updateOrCreate(_, { [`${fsEntry._T}.path`]: fsEntry.path });
                                    log("%s: result=%O\n%s: task.progress=%s", task.name, result, task.name, task.progress);
                                } catch (e: any) {
                                    handleError(e, task, _, store);
                                }
                            }
                        }
                    });
                },

                async function hashFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of /* Artefact.stream */(store.find({//.watch({
                            $and: [
                                { File: { $exists: true } },
                                { $or: [
                                    { Hash: { $exists: false } },
                                    { $expr: { $lt: [ "$Hash._ts", "$File.stats.mtime" ] } }
                                ]}
                            ]
                        }, { progress: task.progress }))) {
                            try {
                                log("%s: _=%O", task.name, _);
                                if (_.File) {
                                    const result = await store.updateOne({ _id: _._id }, { $set: { Hash: await Hash(_.File.path) } });
                                    log("%s: result=%O\n%s: task.progress=%s", task.name, result, task.name, task.progress);
                                }
                            } catch (e: any) {
                                handleError(e, task, _, store);
                            }
                        }
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of /* Artefact.stream */(store.find({
                            $and: [
                                { File: { $exists: true } },
                                { $or: Audio.fileExtensions.map(ext => ({ "File.path": { $regex: "\^.*\\." + ext + "$", $options: "i" } })) },
                                { $or: [
                                    { Audio: { $exists: false } },
                                    { "Audio._ts": { $lt: "$File.stats.mtime" } }
                                ]}
                            ]
                        }, { progress: task.progress }))) {
                            try {
                                log("%s: _=%O", task.name, _);
                                const result = await store.updateOne({ _id: _._id }, { $set: { Audio: await Audio(_.File!.path) } });
                                log("%s: result=%O\n%s: task.progress=%s", task.name, result, task.name, task.progress);
                            } catch (e: any) {
                                handleError(e, task, _, store);
                            }
                        }
                    });
                },
            
            );

        }
    ).demandCommand();

async function handleError(e: Error, task: Task, _: Partial<FileSystemArtefactSchema>, store: Store<FileSystemArtefactSchema>) {
    // const error = Object.assign(e, { task: task });//new Error("${task.name}: Error!\n_=${nodeUtil.inspect(_, false, 1)}\nError={e/* .stack */}"), { /* cause: e, stack: e.stack */ });
    if (!(e instanceof MongoError)) {
        const result = await store.updateOne(
            _._id ? { _id: _._id } :
            _.File ? { "File.path": _.File.path } :
            _.Directory ? { "Directory.path": _.Directory.path } :
            _.Unknown ? { "Unknown.path": _.Unknown?.path } :
            _.Partition ? { "Partition.uuid": _.Partition?.uuid } :
            _.Disk ? { $and: [ { "Disk.model": _.Disk.model }, { "Disk.serial": _.Disk?.serial }, ], } :
            {},
            { $set: { _e: [e] } });
        task.warnings.push(e);
        log("${task.name}: Warn! _=%O Error=%s", _, e.stack);
    } else {
        task.errors.push(e);
        log("${task.name}: Error! _=%O Error=%s", _, e.stack);
        throw e;
    }
}
