import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { MongoStorage, Query, updateResultToString } from "../db";
import { Artefact, ArtefactFn, ArtefactStaticMethods, DiscriminatedModel } from '../models';
import { Entry, walk, Hash } from "../models/file-system";
import exitHook from "async-exit-hook";
import { Audio } from "../models/audio";
import * as nodeUtil from "node:util";
import { ChangeStreamUpdateDocument } from "mongodb";

export type FileSystemArtefact = Artefact<Partial<DiscriminatedModel<Entry>> & { Hash?: Hash; }>;
export const FileSystemArtefact = Object.assign(
    <E extends Entry>(e: E) => ({ [e._T]: e }) as FileSystemArtefact,
    { Query: { ...Artefact.Query, ...{
        byPath(this: FileSystemArtefact) { return this.File ? { "File.path": this.File.path } : this.Directory ? { "Directory.path" : this.Directory.path } : this.Unknown ? { "Unknown.path": this.Unknown.path } : {}; },
    } } }) as ArtefactFn<FileSystemArtefact, [Entry]>;

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
                    index: { "File.path": 1, "Directory.path": 1, "Unknown.path": 1 },
                    options: { unique: true }
                }],
            });//.bulkWriterStore();

            exitHook(async (cb) => {
                console.log("Exiting ...");
                if (!!storage && storage.isConnected()) {
                    await storage.close();
                }
                cb();
            });

            await Task.start(

                async function indexFileSystem(task: Task) {
                    await Task.repeat({ postDelay: 180000/*0*/, }, async () => {   // 3/*0*/ minutes
                        for (const path of argv.paths) {
                            for await (const e of walk({ path, progress: task.progress })) {
                                const result = await store.updateOrCreate({ [e._T]: e }, { [`${e._T}.path`]: e.path }/* , { $set: diffDotNotation({ [`${e._T}`]: e }), } */, { upsert: true });
                                console.log(`result=${/* updateResultToString */nodeUtil.inspect(result)} task.progress=${task.progress}`);
                            }
                        }
                    });
                },

                async function hashFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of store.find({//.watch({
                            $and: [
                                { File: { $exists: true } },
                                { $or: [
                                    { Hash: { $exists: false } },
                                    { $expr: { $lt: [ "$Hash._ts", "$File.stats.mtime" ] } }
                                ]}
                            ]
                        }, { progress: task.progress/* , fullDocument: "updateLookup" */ })) {
                            if (/* _.operationType === "update" && _.fullDocument && */ _/* .fullDocument */.File) {
                                const result = await store.updateOne(Query(_/* .fullDocument */, "_id"), { $set: { Hash: await Hash(_/* .fullDocument */.File.path) } });
                                console.log(`result=${/* updateResultToString */nodeUtil.inspect(result)} task.progress=${task.progress}`);
                            }
                        }
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of store.find({
                            $and: [
                                { File: { $exists: true } },
                                { $or: Audio.fileExtensions.map(ext => ({ "File.path": { $regex: "\^.*\\." + ext, $options: "i" } })) },
                                { $or: [
                                    { Audio: { $exists: false } },
                                    { "Audio._ts": { $lt: "$File.stats.mtime" } }
                                ]}
                            ]
                        }, { progress: task.progress })) {
                            console.log(`_=${nodeUtil.inspect(_)} task.progress=${task.progress}`);
                            const result = await store.updateOne(Query(_, "_id"), { $set: { Audio: await Audio(_.File!.path) } });
                            console.log(`result=${updateResultToString(result)} task.progress=${task.progress}`);
                        }
                    });
                },
            
            );

        }
    ).demandCommand();
