import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { BulkWriterOptions, MongoStorage, Store } from "../db";
import exitHook from "async-exit-hook";
import * as Audio from "../models/audio";
import * as nodePath from "node:path";
import { MongoError } from "mongodb";
import { Artefact, isArtefact } from "../models/artefact";
import * as FS from "../models/file-system";

import debug from "debug";
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

// export class FileSystemArtefact extends Artefact {
//     // Must exist, supplied to constructor
//     get Entry() { 
//         const entry = this.File ?? this.Directory ?? this.Unknown;
//         if (!entry) {
//             throw new TypeError(`FS.Entry does not exist on FileSystemArtefact=${this}`);
//         }
//         return entry;
//     }
//     // And this.Entry above is returning the ONE of these that exists

type FileSystemArtefact = Artefact & {
    File?: FS.File;
    Directory?: FS.Directory;

    Unknown?: FS.Unknown;

    // Only iff !!this.File
    Hash?: FS.Hash;
    Audio?: Audio.Audio;

    Disk?: FS.Disk;
    Partition?: FS.Partition;
}
// ^ make this a const var with the exact same property names (OR: schhema: Artefact[K] = Aspect<K, TAspect>)
// with values built with a ArtefactSliceDefinition<TAspectsUnion>([{]     // * S (can and usually does take multiple Aspect types as a union, represents all known Aspect types for this Artefact type)
//  source:
//      [? AspectSource<S extends TAspectsUnion> =] AsyncGenerator<S[?, shouldRecurse(): boolean, stats: SourceStatsFinished]>,     // * S (can and usually does take multiple Aspect types as a union, represents Aspect types subset from this Artefact type to include in yielded values)
//          // * also: Query<[? TArtefact, ]I extends TAspectsUnion> = AspectSource<I> & Partial<ProgressOptions<?>>
//          // * also PeriodicQuery<I extends TAspectsUnion> = Query<I> & { taskOptions: TaskOptions<?> }
//  fn: [? ArtefactSlice<I extends TAspectsUnion, O extends TAspectsUnion =] AsyncFunction<I extends TAspectsUnion, O extends TAspectsUnion> | Constructor<O, I> | AsyncClass<O, I>     // *also AsyncClass<T, I> = { create([? ...]input: I): T}
//  ...? probably other things..
//  [}]);
//
// that schema/Artefact definition object can be used to produce and process (evolve i.e. add properties) Artefact instances in parallel slices that are persisted to the DB individually as produced
// some slices (i.e. properties on an Artefact type with name same as the class or fn name )

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
            const store = await storage.store<FileSystemArtefact>("fileSystemEntries"/* , FileSystemArtefact */, {
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
                    const bulkWriter = store.bulkWriterSink({ ...BulkWriterOptions.default, progress: task.progress });

                    await Task.repeat({ postDelay: 15000 }, async() => {           // 15s
                        await bulkWriter(
                            (async function* enumerateBlockDevicesSource() {
                                const disks = await FS.Disk.getAll();
                                const partitions = await FS.Partition.getAll();
                                // ops.push(...
                                yield* disks.map(d => store.ops.updateOne(d));
                                // 
                                //     filter: { $and: [ { "Disk.model": { $eq: d.model } }, { "Disk.serial": { $eq: d.serial } }, ], },
                                //     update: { $set: { "Disk": d } },
                                //     upsert: true,
                                // } }));
                                // ops.push(...
                                // yield* partitions.map(p => ({ "updateOne": {
                                //     filter: { "Partition.uuid": { $eq: p.uuid } },
                                //     update: { $set: { "Partition": p } },
                                //     upsert: true,
                                // } }));
                                yield* partitions.map(p => store.ops.updateOne(p))
                            })()
                        );
                    });
                },

                async function indexFileSystem(task: Task) {
                    const bulkWriter = store.bulkWriterSink({ ...BulkWriterOptions.default, progress: task.progress });

                    await Task.repeat({ postDelay: 180000/*0*/, }, async () => {   // 3/*0*/ minutes
                        bulkWriter(
                            (async function* indexFileSystemSource() {
                                for (const path of argv.paths) {
                                    for await (const fsEntry of FS.walk({ path, progress: task.progress })) {
                                        try {
                                            // const _ = yield ({ "findOne": { filter: Artefact.Query(FS.Entry, "path"), } }) ?? new FileSystemArtefact;
                                            // const _ = await store.findOneOrCreate(Query(fsEntry, "path"), () => new FileSystemArtefact());
                                            // _.update(fsEntry);
                                            yield store.ops.updateOne(fsEntry);
                                            log("%s: task.progress=%s fsEntry=%O", task.name, task.progress, fsEntry);
                                        } catch (e: any) {
                                            handleError(e, task, fsEntry, store);
                                        }
                                    }
                                }
                                
                            })()
                        );
                    });
                },

                async function hashFiles(task: Task) {
                    const bulkWriter = store.bulkWriterSink({ ...BulkWriterOptions.default, progress: task.progress });
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
                                        if (_.File) {
                                            _.Hash = await FS.Hash.create(_.File.path);
                                            yield await store.ops.updateOne(_);
                                        }
                                        log("%s: task.progress=%s _=%O", task.name, task.progress, _);
                                    } catch (e: any) {
                                        handleError(e, task, _, store);
                                    }
                                }
                            })()
                        );
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    const bulkWriter = store.bulkWriterSink({ ...BulkWriterOptions.default, progress: task.progress });
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
                                        _.Audio = await Audio.Audio.create(_.File!.path);
                                        yield store.ops.updateOne(_);
                                        log("%s: task.progress=%s _=%O", task.name, task.progress, _);
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
