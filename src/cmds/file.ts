import * as nodeUtil from "node:util";
import { Entry, File, Directory, walk, Hash, isFile } from "../models/file-system";
import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact, DiscriminatedModel } from '../models';
import { Progress } from "../progress";
import { Task } from "../task";
import { MongoStorage/* , Query */ } from "../db";
import { Filter, WithId } from "mongodb";
import { get } from "../prop-path";

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
};

export type FileSystemArtefact = Artefact<
    Partial<DiscriminatedModel<Entry>> & { // File | Directory | Unknown
        Hash?: Hash;
    }>;
export const FileSystemArtefact = (e: Entry) => ({ [e._T]: e }) as FileSystemArtefact;

export const Query = <A extends Artefact>(_: A, path: string): Filter<A> => ({ [path]: get(_, path) }) as Filter<A>;

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
            Task.start(
                async function indexFileSystem(task: Task) {
                    for (const path of argv.paths) {
                        const storage = new MongoStorage("mongodb://mongo:mongo@localhost:27017/");
                        const store = (await storage.store<FileSystemArtefact>("fileSystemEntries"));//.bulkWriterStore();
                        for await (const e of walk({ path, progress: task.progress })) {
                            const _ = FileSystemArtefact(e);
                            // if (_.File && isFile(_.File)) {
                            //     _.Hash = await Hash({ path: _.File.path });
                            // }
                            const result = await store.updateOrCreate(_, Query(_, `${e._T}.path`)); // ({ [`${e._T}.path`]: _[e._T]?.path })
                            console.log(`result=${nodeUtil.inspect(result)} task.progress=${task.progress}`); //_=${nodeUtil.inspect(_)} 
                        }
                        console.log(`Closing storage=${storage}`);
                        await storage.close();
                    }
                },
                async function hashFiles(task: Task) {
                    const storage = new MongoStorage("mongodb://mongo:mongo@localhost:27017/");
                    const store = (await storage.store<FileSystemArtefact>("fileSystemEntries"));//.bulkWriterStore();
                    for await (const _ of store.find({  //Query.and(Query(File).exists(),)) {
                        $and: [
                            { File: { $exists: true } },
                            {
                                $or: [
                                    { Hash: { $exists: false } },
                                    { $expr: { $lt: ["Hash._ts.updated", "$File.stats.mtime"] } }
                                ]
                            }
                        ]
                    }, { progress: task.progress })) {
                        const result = await store.updateOne(Query(_, "_id"), { $set: { Hash: await Hash({ path: _.File!.path }) } });
                        console.log(`result=${nodeUtil.inspect(result)} task.progress=${task.progress}`); //_=${nodeUtil.inspect(_)} 
                    }
                }
            );
        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};

