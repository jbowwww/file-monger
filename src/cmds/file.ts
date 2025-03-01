import yargs from "yargs";
import { globalOptions } from "../cli";
import { Task } from "../task";
import { MongoStorage, Query, updateResultToString } from "../db";
import { Artefact, ArtefactStaticExtensionQueries, DiscriminatedModel, isAspect, QueryableArtefact } from '../models';
import { Entry, walk, Hash, EntryType, Unknown, File, Directory } from '../models/file-system';
import exitHook from "async-exit-hook";
import { Audio } from "../models/audio";
import * as nodeUtil from "node:util";
import { ChangeStreamUpdateDocument, Filter, MongoError } from "mongodb";
import { ArtefactStaticQueries } from '../models/index';

// function exclude<A extends Artefact, V>(
//     target: any,
//     context: /* ClassFieldDecoratorContext */ClassGetterDecoratorContext<A, V> & { name: string; private: false; static: false; }): void | ((/* this: FileSystemArtefact, value: V */) => V
// ) {
//     context.metadata[context.name] = { exclude: true };
// }

export class FileSystemArtefact extends Artefact {
    // @exclude
    get Entry(): Entry { return (this.File ?? this.Directory ?? this.Unknown) as Entry; };
    File?: File;
    Directory?: Directory;
    Unknown?: Unknown;
    Hash?: Hash;

    static Query: ArtefactStaticQueries<Artefact> & ArtefactStaticExtensionQueries<FileSystemArtefact>;

    constructor(data: Partial<FileSystemArtefact> | Entry) {
        super();
        if (isAspect<Entry>(data)) {
            switch (data._T) {
                case EntryType.File: this[EntryType.File] = data; break;
                case EntryType.Directory: this[EntryType.Directory] = data; break;
                case EntryType.Unknown: this[EntryType.Unknown] = data; break;
                default: throw new TypeError(`FileSystemArtefact.ctor(): Unknown data._T, data=${nodeUtil.inspect(data)}`); break;                
            }
        } else {
            this.File = data.File;
            this.Directory = data.Directory;
            this.Unknown = data.Unknown;
        }
    }
    
    static {
        this.Query = {
            ...Artefact.Query,
            byPath: (_) => (
                _.File       ? { "File.path":        { $eq: _.File!.path }      } :
                _.Directory  ? { "Directory.path" :  { $eq: _.Directory!.path } } :
                _.Unknown    ? { "Unknown.path":     { $eq: _.Unknown!.path   } } :
                {}
            ),
            byIdOrPath: (_) => _._id ? this.Query.byId(_) : this.Query.byPath(_),
        };
    }
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
                                    console.log(`_=${nodeUtil.inspect(_)} _.Query=${Object.entries(FileSystemArtefact.Query).map(([K, V]) => ""+ K + ":" + nodeUtil.inspect(V)+V.toString()).join("\n")}`);
                                    const result = await store.updateOrCreate(_, FileSystemArtefact.Query.byPath(_));
                                    console.log(`result=${/* updateResultToString */nodeUtil.inspect(result)} task.progress=${task.progress}`);
                                } catch (e) {
                                    const error = new Error(_.Entry?.path);//, { cause: e });
                                    console.error(`indexFileSystem: Error: _.Entry.path=${_.Entry?.path}: ${e}`);
                                    if (!(e instanceof MongoError)) {
                                        const result = await store.updateOne(FileSystemArtefact.Query.byIdOrPath(_), { $set: { [_.Entry._T!]: _[_.Entry._T] }, $push: { _E: error } });
                                        task.warnings.push(error);
                                    } else {
                                        task.errors.push(error);
                                    }
                                    continue;
                                    // throw error;
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
                                console.log(`hashFiles: _=${nodeUtil.inspect(_)}`);
                                if (_.File) {
                                    const result = await store.updateOne(FileSystemArtefact.Query.byId(_), { $set: { Hash: await Hash(_.File.path) } });
                                    console.log(`result=${/* updateResultToString */nodeUtil.inspect(result)} task.progress=${task.progress}`);
                                }
                            } catch (e) {
                                const error = new Error(`_._id=${_._id} _.Entry.path=${_.Entry?.path}`);//, { cause: e });
                                console.error(`hashFiles: Error: _._id=${_._id} _.Entry?.path=${_.Entry?.path}: ${e}`);
                                if (!(e instanceof MongoError)) {
                                    const result = await store.updateOne(FileSystemArtefact.Query.byIdOrPath(_), { $set: { [EntryType.File as keyof FileSystemArtefact]: _.File }, $push: { _E: error } });
                                    task.warnings.push(error);
                                    console.warn(error);
                                } else {
                                    task.errors.push(error);
                                    console.error(error);
                                }
                                throw error;
                            }
                        }
                    });
                },

                async function analyzeAudioFiles(task: Task) {
                    await Task.repeat({ preDelay: 3000, }, async () => {     // 3 seconds
                        for await (const _ of FileSystemArtefact.stream(store.find({
                            $and: [
                                { File: { $exists: true } },
                                { $or: Audio.fileExtensions.map(ext => ({ "File.path": { $regex: "\^.*\\." + ext, $options: "i" } })) },
                                { $or: [
                                    { Audio: { $exists: false } },
                                    { "Audio._ts": { $lt: "$File.stats.mtime" } }
                                ]}
                            ]
                        }, { progress: task.progress }))) {
                            try {
                                console.log(`_=${nodeUtil.inspect(_)} task.progress=${task.progress}`);
                                const result = await store.updateOne(FileSystemArtefact.Query.byId(_), { $set: { Audio: await Audio(_.File!.path) } });
                                console.log(`result=${updateResultToString(result)} task.progress=${task.progress}`);
                            } catch (e) {
                                const error = new Error(`_._id=${_._id} _.Entry.path=${_.Entry?.path} ${e}`);//, { cause: e });
                                console.error(`hashFiles: Error: _._id=${_._id} _.Entry?.path=${_.Entry?.path}: ${e}`);
                                if (!(e instanceof MongoError)) {
                                    const result = await store.updateOne(FileSystemArtefact.Query.byIdOrPath(_), { $set: { [EntryType.File as keyof FileSystemArtefact]: _.File }, $push: { _E: error } });
                                    task.warnings.push(error);
                                    console.warn(error);
                                } else {
                                    task.errors.push(error);
                                    console.error(error);
                                }
                                throw error;
                            }
                        }
                    });
                },
            
            );

        }
    ).demandCommand();
