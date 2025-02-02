import * as nodeUtil from "node:util";
import * as db from '../db';
import { Entry, File, Directory, Unknown, walk, Hash, EntryType } from "../models/file-system";
import yargs, { ArgumentsCamelCase } from "yargs";
import { Artefact } from '../models';
import {} from "@fieldguide/pipeline"
import { pipeline } from "../pipeline";
import { Filter } from "mongodb";

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

function enumerable(enumerable: boolean) {
    return function(target: any, key: string/* , desc: any */ /* context: ClassFieldDecoratorContext<FileArtefact> */): any {
        // const key = context.name as string;
        console.debug(`enumerable(${enumerable}): key=${key} target=${nodeUtil.inspect(target)} / ${target} target.prototype=${nodeUtil.inspect(target.prototype)} / ${target.prototype} target[key] = ${nodeUtil.inspect(target[key])}`);
        // while (!!target && !Object.hasOwn(target, key)) {
        //     console.debug(`target = target.prototype = ${nodeUtil.inspect(target.prototype)}`);
        //     target = target.prototype;
        // }
        const desc = Object.getOwnPropertyDescriptor(target, key) ?? { value: "", configurable: true, writable: true };
        desc.enumerable = enumerable;
        console.debug(`desc = ${nodeUtil.inspect(desc)}`);
        // return desc;
        Object.defineProperty(target, key, desc);
        // if (!!target) {
        //     Object.defineProperty(target, key, { set(value) {
        //         console.debug(`target[key] 3 = ${nodeUtil.inspect(target[key])}`);
        //         Object.defineProperty(this, key, { value, configurable: true, writable: true, enumerable });
        //         console.debug(`target[key] 4 = ${nodeUtil.inspect(target[key])}`);
        //     }, configurable: true });
        //     console.debug(`target[key] 2 = ${nodeUtil.inspect(target[key])}`);
        // }
    };
};

class FileArtefact extends Artefact {

    constructor(Entry: Entry) { super(); this.#Entry = Entry; /* this[e._T] = e; */ }
    #Entry: Entry;
    
    get File(): File | undefined { return this.#Entry._T === EntryType.File ? this.#Entry as File : undefined; }
    get Directory(): Directory | undefined { return this.#Entry._T === EntryType.Directory ? this.#Entry as Directory : undefined; }
    get Unknown(): Unknown | undefined { return this.#Entry._T === EntryType.Unknown ? this.#Entry as Unknown : undefined; }
    
    Hash?: Hash | undefined
    
    // @enumerable(false)
    get query() {
        return {
            byId: () => super.query.byId(),   // need to use .bind() or .apply() with this ??
            byPath: () => ["File", "Directory", "Unknown"]
                .filter(_T => !!this[_T as EntryType])
                .map(_T => ({ [`${_T}.path`]: this[_T as EntryType]?.path }))[0],
            byPrimary: () => !this.isNew ? this.query.byId() : this.query.byPath,
        };
    }
};

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
            for (const path of argv.paths) {
                db.configure(() => new db.MongoStorage("mongodb://mongo:mongo@localhost:27017/"));
                const store = await db.storage.store<FileArtefact>("fileSystemEntries");
                for await (const e of walk({ path })) {
                    const _ = new FileArtefact(e);
                    if (!!_.File) {
                        _.Hash = await Hash({ path: _.File.path });
                    }
                    const result = await store.updateOrCreate(_, ({ [`${e._T}.path`]: _[e._T]?.path }), { upsert: true, ignoreUndefined: true });
                    console.log(`_=${nodeUtil.inspect(_)} result=${nodeUtil.inspect(result)}`);// task.progress=
                }
                console.log(`Closing db.storage=${db}`);
                await db.storage.close();
            }
        })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase) {
    console.log(`cmds/file handler argv=${JSON.stringify(argv)}`);
};

