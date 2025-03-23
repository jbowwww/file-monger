import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { MongoStorage, Store } from "../db";
import { walk, Hash, Unknown, File, Directory, getPartitions, Partition } from "../models/file-system";
import exitHook from "async-exit-hook";
import { Audio } from "../models/audio";
import * as nodePath from "node:path";
import { MongoError } from "mongodb";

import debug from "debug";
import { Artefact } from "../models/artefact";
const log = debug(nodePath.basename(module.filename));

export type FileSystemSchema = /* Artefact< */{
    // get Entry(): Entry { return this.File ?? this.Directory ?? this.Unknown!; }
    File?: File;
    Directory?: Directory;
    Unknown?: Unknown;
    Hash?: Hash;
    Drive?: Partition;
}/* > */;
export type FileSystemArtefactSchema = Artefact<FileSystemSchema>;
//     constructor(data: Partial<FileSystemArtefactSchema> | Entry) {
//         if (isAspect<Entry>(data)) {
//             super();
//             log("FileSystemArtefact.ctor(): isAspect(data)=true: data=%O this=%O", data, this);
//             this[data._T as string] = data;
//         } else {
//             const _data = data as Partial<FileSystemArtefactSchema>;
//             super({ _id: _data._id, _e: _data._e });
//             this.File = _data.File;
//             this.Directory = _data.Directory;
//             this.Unknown = _data.Unknown;
//             log("FileSystemArtefact.ctor(): isAspect(data)=false: _data=%O this=%O", _data, this);
//         }
//     }
    
//     // Queries defined in this static member also get copied to the instance prototype, currying the parameter with this
//     // So if your instance variable is _, queries will be available like e.g. _.Query.byPath() and it will use the path value of this instance
//     static Query = {
//         ...Artefact.Query,
//         byUnique: (_: Artefact) => this.Query.byIdOrPath(_ as FileSystemArtefactSchema) as Filter<Artefact>,
//         byPath: (_: FileSystemArtefactSchema) => ({ [_.Entry._T + ".path"]: { $eq: _.Entry.path } }) as Filter<FileSystemArtefactSchema>,
//             // _.File       ? { "File.path":        { $eq: _.File!.path }      } :
//             // _.Directory  ? { "Directory.path" :  { $eq: _.Directory!.path } } :
//             // _.Unknown    ? { "Unknown.path":     { $eq: _.Unknown!.path   } } :
//             // {}
//         // ) as Filter<FileSystemArtefact>,
//         byIdOrPath: (_: FileSystemArtefactSchema) => _._id ? this.Query.byId(_) : this.Query.byPath(_) as Filter<FileSystemArtefactSchema>,
//     };
// }

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
            const store = await storage.store<FileSystemSchema>("fileSystemEntries", {
                createIndexes: [{
                    index: { "File.path": 1, "Directory.path": 1, "Unknown.path": 1 },
                    options: { unique: true }
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

                // async function enumerateSystemDrives(task: Task) {
                //     await Task.repeat({ postDelay: 5000 }, async() => {           // 5s
                //         const drives = await getPartitions();
                //         const ops = drives.map(d => ({ "updateOne": {
                //             filter: { "Drive.uuid": { $eq: d.uuid } },
                //             update: { $set: { "Drive": d } },
                //             upsert: true,
                //         } }))
                //     });
                // },

                async function indexFileSystem(task: Task) {
                    await Task.repeat({ postDelay: 180000/*0*/, }, async () => {   // 3/*0*/ minutes
                        for (const path of argv.paths) {
                            for await (const fsEntry of walk({ path, progress: task.progress })) {
                                const _ = { [fsEntry._T]: fsEntry, };
                                try {
                                    const result = await store.updateOrCreate(_, { [`${fsEntry._T}.path`]: fsEntry.path });// Query<FileSystemArtefactSchema>(`${fsEntry._T}.path`, fsEntry.path);
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
                                if (_.File) {
                                    const result = await store.updateOne({ _id: _._id }, { $set: { Hash: await Hash(_.File.path) } });
                                    log("%s: result=%O\n%s: _=%O task.progress=%s", task.name, result, _, task.name, task.progress);
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
                                const result = await store.updateOne({ _id: _._id }, { $set: { Audio: await Audio(_.File!.path) } });
                                log("%s: result=%O\n%s: _=%O task.progress=%s", task.name, result, _, task.name, task.progress);
                            } catch (e: any) {
                                handleError(e, task, _, store);
                            }
                        }
                    });
                },
            
            );

        }
    ).demandCommand();

async function handleError(e: Error, task: Task, _: Partial<FileSystemArtefactSchema>, store: Store<FileSystemSchema>) {
    // const error = Object.assign(e, { task: task });//new Error("${task.name}: Error!\n_=${nodeUtil.inspect(_, false, 1)}\nError={e/* .stack */}"), { /* cause: e, stack: e.stack */ });
    if (!(e instanceof MongoError)) {
        const result = await store.updateOne(_._id ? { _id: _._id } : _.File ? { "File.path": _.File.path } : _.Directory ? { "Directory.path": _.Directory.path } : { "Unknown.path": _.Unknown?.path }, { $set: { _e: [e] } });
        task.warnings.push(e);
        log("${task.name}: Warn! _=%O Error=%s", _, e.stack);
    } else {
        task.errors.push(e);
        log("${task.name}: Error! _=%O Error=%s", _, e.stack);
        throw e;
    }
}
