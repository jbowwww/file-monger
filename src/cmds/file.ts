import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { diffDotNotation, MongoStorage, Query, updateResultToString } from "../db";
import { Artefact, DiscriminatedModel } from '../models';
import { Entry, walk, Hash } from "../models/file-system";
import exitHook from "async-exit-hook";
import { Audio } from "../models/audio";

export type FileSystemArtefact = Artefact<Partial<DiscriminatedModel<Entry>> & { Hash?: Hash; }>;
export const FileSystemArtefact = (e: Entry) => ({ [e._T]: e }) as FileSystemArtefact;

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
            const store = (await storage.store<FileSystemArtefact>("fileSystemEntries"));//.bulkWriterStore();

            exitHook(async (cb) => {
                console.log("Exiting ...");
                if (!!storage && storage.isConnected()) {
                    await storage.close();
                }
                cb();
            });

            await Task.start(

                async function indexFileSystem(task: Task) {
                    await Task.repeat(async () => {
                        for (const path of argv.paths) {
                            for await (const e of walk({ path, progress: task.progress })) {
                                const result = await store.updateOne({ [`${e._T}.path`]: e.path }, { $set: diffDotNotation({ [`${e._T}`]: e }), }, { upsert: true });
                                console.log(`result=${updateResultToString(result)} task.progress=${task.progress}`);
                            }
                        }
                        await Task.delay(180000);   // 30 minutes
                    });
                },

                async function hashFiles(task: Task) {
                    await Task.repeat(async () => {
                        await Task.delay(3000);     // 3 seconds
                        for await (const _ of store.find({
                            $and: [
                                { File: { $exists: true } },
                                { $or: [
                                    { Hash: { $exists: false } },
                                    { $expr: { $lt: [ "$Hash._ts", "$File.stats.mtime" ] } }
                                ]}
                            ]
                        }, { progress: task.progress })) {
                            const result = await store.updateOne(Query(_, "_id"), { $set: { Hash: await Hash(_.File!.path) } });
                            console.log(`result=${updateResultToString(result)} task.progress=${task.progress}`);
                        }
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    await Task.repeat(async () => {
                        await Task.delay(3000);     // 3 seconds
                        for await (const _ of store.find({
                            $and: [
                                { File: { path: { $in: Audio.fileExtensions } } },
                                { $or: [
                                    { Audio: { $exists: false } },
                                    { $expr: { $lt: [ "$Audio._ts", "$File.stats.mtime" ] } }
                                ]}
                            ]
                        }, { progress: task.progress })) {
                            const result = await store.updateOne(Query(_, "_id"), { $set: { Audio: await Audio(_.File!.path) } });
                            console.log(`result=${updateResultToString(result)} task.progress=${task.progress}`);
                        }
                    });
                },
            
            );

        }
    ).demandCommand();
