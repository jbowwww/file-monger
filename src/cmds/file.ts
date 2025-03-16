import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { MongoStorage, Store } from "../db";
import { Artefact, ArtefactStaticExtensionQueries, isAspect } from '../models';
import { Entry, walk, Hash, Unknown, File, Directory, EntryTypeName, EntryTypeNames } from '../models/file-system';
import exitHook from "async-exit-hook";
import { Audio } from "../models/audio";
import * as nodeUtil from "node:util";
import { Filter, MongoError } from "mongodb";
import { ArtefactStaticQueries } from '../models/index';

// function exclude<A extends Artefact, V>(
//     target: any,
//     context: /* ClassFieldDecoratorContext */ClassGetterDecoratorContext<A, V> & { name: string; private: false; static: false; }): void | ((/* this: FileSystemArtefact, value: V */) => V
// ) {
//     context.metadata[context.name] = { exclude: true };
// }

export class FileSystemArtefact extends Artefact {
    // @exclude
    File?: File;
    Directory?: Directory;
    Unknown?: Unknown;
    Hash?: Hash;

    constructor(data: Partial<FileSystemArtefact> | Entry) {
        if (isAspect<Entry>(data)) {
            super();
            console.debug(`FileSystemArtefact.ctor(): isAspect(data)=true: data=${nodeUtil.inspect(data)} this=${nodeUtil.inspect(this)}`);
            this[data._T as string] = data;
        } else {
            super({ _id: data._id, _E: data._E });
            this.File = data.File;
            this.Directory = data.Directory;
            this.Unknown = data.Unknown;
            console.debug(`FileSystemArtefact.ctor(): isAspect(data)=false: data=${nodeUtil.inspect(data)} this=${nodeUtil.inspect(this)}`);
        }
    }
    
    // Queries defined in this static member also get copied to the instance prototype, currying the parameter with this
    // So if your instance variable is _, queries will be available like e.g. _.Query.byPath() and it will use the path value of this instance
    static Query = {
        ...Artefact.Query,
        byPath: (_: FileSystemArtefact) => (
            _.File       ? { "File.path":        { $eq: _.File!.path }      } :
            _.Directory  ? { "Directory.path" :  { $eq: _.Directory!.path } } :
            _.Unknown    ? { "Unknown.path":     { $eq: _.Unknown!.path   } } :
            {}
        ) as Filter<FileSystemArtefact>,
        byIdOrPath: (_: FileSystemArtefact) => _._id ? this.Query.byId(_) : this.Query.byPath(_) as Filter<FileSystemArtefact>,
    };
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
                            for await (const _ of FileSystemArtefact.stream(walk({ path, progress: task.progress }))) {
                                try {
                                    const result = await store.updateOrCreate(_, FileSystemArtefact.Query.byPath(_));
                                    console.log(`${task.name}: result=${/* updateResultToString */nodeUtil.inspect(result, false, 3)}\n${task.name}: task.progress=${task.progress}`);
                                } catch (e: any) {
                                    handleError(e, task, _, store);
                                }
                            }
                        }
                    });
                },

                async function hashFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of FileSystemArtefact.stream(store.find({//.watch({
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
                                    const result = await store.updateOne(FileSystemArtefact.Query.byId(_), { $set: { Hash: await Hash(_.File.path) } });
                                    console.log(`${task.name}: result=${/* updateResultToString */nodeUtil.inspect(result, false, 3)}\n${task.name}: _=${nodeUtil.inspect(_, false, 1)}\n${task.name}: task.progress=${task.progress}`);
                                }
                            } catch (e: any) {
                                handleError(e, task, _, store);
                            }
                        }
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of FileSystemArtefact.stream(store.find({
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
                                const result = await store.updateOne(FileSystemArtefact.Query.byId(_), { $set: { Audio: await Audio(_.File!.path) } });
                                console.log(`${task.name}: result=${/* updateResultToString */nodeUtil.inspect(result, false, 3)}\n${task.name}: _=${nodeUtil.inspect(_, false, 1)}\n${task.name}: task.progress=${task.progress}\n`);
                            } catch (e: any) {
                                handleError(e, task, _, store);
                            }
                        }
                    });
                },
            
            );

        }
    ).demandCommand();

async function handleError(e: Error, task: Task, _: FileSystemArtefact, store: Store<FileSystemArtefact>) {
    // const error = Object.assign(e, { task: task });//new Error(`${task.name}: Error!\n_=${nodeUtil.inspect(_, false, 1)}\nError={e/* .stack */}`), { /* cause: e, stack: e.stack */ });
    if (!(e instanceof MongoError)) {
        const result = await store.updateOne(FileSystemArtefact.Query.byIdOrPath(_), { $set: { _E: [e] } });
        task.warnings.push(e);
        console.warn(`${task.name}: Warn! _=${nodeUtil.inspect(_, false, 3)} Error=${e.stack}`);
    } else {
        task.errors.push(e);
        console.error(`${task.name}: Error! _=${nodeUtil.inspect(_, false, 3)} Error=${e.stack}`);
        throw e;
    }
}
