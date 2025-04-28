import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { BulkWriterOptions, MongoStorage, Query, Store } from "../db";
import exitHook from "async-exit-hook";
import * as Audio from "../models/audio";
import * as nodePath from "node:path";
import { AnyBulkWriteOperation, MongoError } from "mongodb";

import debug from "debug";
import { Artefact } from "../models/artefact";
import { AbstractConstructor, Constructor, DiscriminatedModel } from "../models";
import { PipelinePromise } from "node:stream";
import * as FS from "../models/file-system";
import * as Tags from "../models/tags";
const log = debug(nodePath.basename(module.filename));

// export const FileArtefact = {
//     file: FS.File,
//     disk: {
//         dependencies: ['file'],
//         // type: FS.Disk,
//         get: async (_: { file: FS.File }) => FS.Disk.getForPath(_.file.path),
//     },
//     partition: {
//         dependencies: ['file'],
//         // type: FS.Partition,
//         get: async (_: { file: FS.File }) => await FS.Partition.getForPath(_.file.path),
//     },
//     hash: {
//         dependencies: ['file'],
//         get: async (_: { file: FS.File }) => await FS.Hash.create(_.file.path),
//     },
//     audio: Audio.Audio,
//     tags: Tags.Tags,
// };

// export class InstanceLoader<T extends { [K in keyof T]: Constructor<T[K]> & { create(...args: any[]): Promise<InstanceType<T[K]>>; }; }> {
//     constructor(private classes: { [K in keyof T]: Constructor<T[K]> & { create(...args: any[]): Promise<InstanceType<T[K]>>}; }) {

//     }

//     getInstance(name: string, ...args: any[]) {
//         return new (this.classes[name as keyof T])(...args);
//     }

//     async createInstance(name: string, ...args: any[]) {
//         return await (this.classes[name as keyof T]).create(...args);
//     }
// }
// export const FileArtefact = Artefact.Type({
//     file: FS.File,
//     hash: FS.Hash,
//     audio: Audio.Audio,
// }, (e: FS.File) => ({ [e.constructor.name as "file"]: e as FS.File }));

// export const DirectoryArtefact = Artefact.Type({
//     directory: FS.Directory,
// }, (e: FS.Entry) => ({ [e.constructor.name]: e as FS.Directory }));

// export const UnknownArtefact = Artefact.Type({
//     unknown: FS.Unknown,
// }, (e: FS.Entry) => ({ [e.constructor.name]: e as FS.Unknown }));

// export type FileSystemArtefact = { [K in keyof typeof FileSystemArtefact]: Awaited<ReturnType<typeof FileSystemArtefact[K]>>; };

export class FileSystemArtefact extends Artefact {
    File?: FS.File;
    Hash?: FS.Hash;
    Audio?: Audio.Audio;

    Directory?: FS.Directory;

    Unknown?: FS.Unknown;
}

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
            const store = await storage.store<FileSystemArtefact>("fileSystemEntries", {
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
                    const bulkWriter = store.bulkWriterFn({ ...BulkWriterOptions.default, progress: task.progress });

                    await Task.repeat({ postDelay: 5000 }, async() => {           // 5s
                        await bulkWriter(
                            (async function* enumerateBlockDevicesSource() {
                                const disks = await FS.Disk.getAll();
                                const partitions = await FS.Partition.getAll();
                                const ops: AnyBulkWriteOperation<FileSystemArtefact>[] = [];
                                // ops.push(...
                                yield* disks.map(d => store.ops.updateOne(new FileSystemArtefact()., Disk));
                                // {
                                //     filter: { $and: [ { "Disk.model": { $eq: d.model } }, { "Disk.serial": { $eq: d.serial } }, ], },
                                //     update: { $set: { "Disk": d } },
                                //     upsert: true,
                                // } }));
                                // ops.push(...
                                yield* partitions.map(p => ({ "updateOne": {
                                    filter: { "Partition.uuid": { $eq: p.uuid } },
                                    update: { $set: { "Partition": p } },
                                    upsert: true,
                                } }));

                            })()
                        );
                    });
                },

                async function indexFileSystem(task: Task) {
                    const bulkWriter = store.bulkWriterFn({ ...BulkWriterOptions.default, progress: task.progress });

                    await Task.repeat({ postDelay: 180000/*0*/, }, async () => {   // 3/*0*/ minutes
                        bulkWriter(
                            (async function* indexFileSystemSource() {
                                for (const path of argv.paths) {
                                    for await (const fsEntry of FS.walk({ path, progress: task.progress })) {
                                        const _ = await store.findOne({ [`${fsEntry._T}.path`]: fsEntry.path, }) ?? new FileSystemArtefact();
                                        _[fsEntry._T] = fsEntry;
                                        try {
                                            log("%s: _=%O", task.name, _);
                                            // const result = await store.updateOrCreate(_, { [`${fsEntry.constructor.name.toLowerCase()}.path`]: fsEntry.path });
                                            yield ({ "updateOne": {
                                                filter: { [`${fsEntry.constructor.name.toLowerCase()}.path`]: fsEntry.path, },
                                                update: { $set: { [fsEntry.constructor.name.toLowerCase()]: fsEntry, } },
                                                upsert: true,
                                            } });
                                            log("%s: result=%O\n%s: task.progress=%s", task.name, result, task.name, task.progress);
                                        } catch (e: any) {
                                            handleError(e, task, _, store);
                                        }
                                    }
                                }
                                
                            })()
                        );
                    });
                },

                async function hashFiles(task: Task) {
                    const bulkWriter = store.bulkWriterFn({ ...BulkWriterOptions.default, progress: task.progress });
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        bulkWriter(
                            (async function* hashFilesSource() {
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
                                        if (_.file) {
                                            const result = await store.updateOne({ _id: _._id }, { $set: { Hash: FS.Hash.create(_.file.path) } });
                                            log("%s: result=%O\n%s: task.progress=%s", task.name, result, task.name, task.progress);
                                        }
                                    } catch (e: any) {
                                        handleError(e, task, _, store);
                                    }
                                }
                            })()
                        );
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    const bulkWriter = store.bulkWriterFn({ ...BulkWriterOptions.default, progress: task.progress });
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        bulkWriter(
                            (async function* analyzeAudioFilesSource() {
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
                                        const result = await store.updateOne({ _id: _._id }, { $set: { Audio: await Audio.Audio(_.file!.path) } });
                                        log("%s: result=%O\n%s: task.progress=%s", task.name, result, task.name, task.progress);
                                    } catch (e: any) {
                                        handleError(e, task, _, store);
                                    }
                                }
                            })()
                        );
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
            _.file ? { "File.path": _.file.path } :
            _.directory ? { "Directory.path": _.directory.path } :
            _.unknown ? { "Unknown.path": _.unknown?.path } :
            _.partition ? { "Partition.uuid": _.partition?.uuid } :
            _.disk ? { $and: [ { "Disk.model": _.disk.model }, { "Disk.serial": _.disk?.serial }, ], } :
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
