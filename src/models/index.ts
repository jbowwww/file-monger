import * as nodeUtil from "node:util";
import * as nodePath from "node:path";
import { isPromise } from "util/types";
import * as db from "../db";
import * as FileSystem from "./file-system";
import { get, set } from "../prop-path";
import { diff } from "deep-object-diff";
import { File, Directory, Unknown, Entry, isFile, isDirectory, isUnknown, Hash } from "./file-system";
import { Filter } from "mongodb";

// export type DiscriminateUnion<T, K extends keyof T, V extends keyof T> = Extract<T, Record<string, V>>;
// export type DiscriminatedModel<T extends Record<string, T[K]>, K extends keyof T = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };
export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[keyof T]>, K extends PropertyKey/* keyof T */ = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Id<T> = {[K in keyof T]: T[K]};
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type Aspect = { _T: string; };
export const isAspect = (aspect: any): aspect is Aspect => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";

export class Artefact {
    _id?: string;
    get isNew() { return !this._id; }
    get query() {
        return {
            byId: (): Filter<Artefact> => ({ _id: this._id }),
        };
    };
};

// export const Artefact = <T extends { _id?: string } = { _id?: string}>(data: any): Artefact =>
//     Object.assign(this ?? { prototype: Artefact.prototype }, data);
// Artefact.prototype = {
//     isNew() { return !this._id; },
//     query: {
//         byId: (: Artefact) = ({ _id: this._id }),
//     },
// };
// export type Artefact = ReturnType<typeof Artefact>;

// export type ArtefactData = { _id?: string; } & { [K: string]: any; };
// export const Artefact = (...aspects: Aspect[]) => Object.assign({}, aspects.map(a => ({ [a._T]: a })));

// export type Artefact = { [K: string]: { [K: string]: ArtefactData; } } & { _id?: string; prototype: { query: (propertyPath: string) => any; } };//ReturnType<typeof Artefact>;
// export class Artefact /* extends Map<string, any> */{

//     _id?: string;
    
//     diff(prevState: ArtefactData): Partial<ArtefactData> {
//         return diff(prevState, this);
//     }

//     query(propertyPath: string) {
//         const q = ({ [propertyPath]: { "$eq": /* super */get(this, propertyPath) } });
//         console.debug(`query(): q=${nodeUtil.inspect(q)}`);
//         return q;
//     }

// // , ({ [moduleName]: { [aspect._T]: aspect } })), {

//     static async* stream<A extends typeof Artefact>(this: A,/* moduleName: string, */ source: WrappedModuleGenerator<AsyncIterable<Aspect>>) {
//         console.debug(`stream(): source=${nodeUtil.inspect(Object.entries(source))}`);
//         for await (const aspect of source) {
//             console.debug(`stream(): aspect=${nodeUtil.inspect(Object.entries(aspect))}`);
//             // let moduleName = source._M.replace(/(\-)(.?)/g, (s, ...args: string[]) => args[1].toUpperCase());
//             // let extIndex = moduleName.lastIndexOf(".");
//             // if (extIndex > 0) {
//             //     moduleName = moduleName.substring(0, extIndex);
//             // }
//             // aspect._T = moduleName + "/" + aspect._T;
//             console.debug(`stream()2: aspect=${nodeUtil.inspect(Object.entries(aspect))}`);
//             yield new Artefact(/* moduleName, */ /* aspect as any as Entry */);
//         }
//     }
// }
// export const isArtefact = (a: any): a is Artefact => a instanceof Artefact;
// });///*  extends Map<string, Aspect | Promise<Aspect>> */ {
    // constructor(...artefactOrAspects: [Artefact] | Aspect[]) {
    //     super();
    //     if (artefactOrAspects.length === 1 && isArtefact(artefactOrAspects[0])) {
    //         const _ = artefactOrAspects[0];
    //         this._id = _._id;
    //         Object.entries(_).forEach(([_T, a]) => {
    //             // set(this, _T, a);
    //             this.add(_T, a);
    //         });
    //     } else {
    //         artefactOrAspects.forEach(a => this.add(a as Aspect));
    //     }
    // }
    // constructor(data: ArtefactData) {
    //     super();
    // }
    // add(aspectOrName: string | Aspect, aspect?: Aspect) {
    //     if (typeof aspectOrName === "string" && !!aspect) {
    //         super.set(aspectOrName, aspect);
    //     } else if (isAspect(aspectOrName)) {
    //         super.set(aspectOrName._T, aspectOrName);
    //     } else {
    //         throw new TypeError(`Artefact.add(): aspectOrName=${aspectOrName} aspect=${aspect}`);
    //     }
    // }
    // delete(aspect: string | Aspect) {
    //     return super.delete(isAspect(aspect) ? aspect._T : aspect);
    // }
    // toData() {
    //     return ({
    //         _id: this._id,
    //         ...Object.fromEntries(Array.from(super.entries())
    //             .filter(([_T, a]) => !isPromise(a))) });
    //             // .map(([_T, a]) => ([!isPromise(a)]))
    // }
    // async* streamData(prevState?: ArtefactData, yieldResolvedDataFirst: boolean = true): AsyncGenerator<Partial<ArtefactData>> {
    //     if (yieldResolvedDataFirst) {
    //         yield prevState ? this.diff(prevState) : this.toData();
    //     }
    //     let pendingData: Array<Promise<Aspect>>;
    //     do {
    //         pendingData = Array.from(super.entries())?.filter(([_T, a]) => isPromise(a))?.map(([_T, a], index, arr) =>
    //             (a as Promise<Aspect>).then(a => {
    //                 super.set(_T, a);
    //                 arr.splice(index, 1);
    //                 return a;
    //             }));
    //         const a = await Promise.race(pendingData);
    //         const update = ({ [a._T]: a });
    //         yield update;
    //     } while (pendingData.length > 0);
    // }
// }

export type WrappedModuleGenerator<T extends AsyncIterable<any> | AsyncGenerator<any>> = T & { _M: string; };
export const wrapModuleGeneratorMetadata = (_M: string, generator: (...args: any[]) => AsyncGenerator<any>) => {
    return (...args: any[]) => (Object.assign(
        async function* () {
            for await (const item of generator(...args)) {
                console.debug(`wrapModuleGeneratorMetadata(): item=${nodeUtil.inspect(Object.entries(item))}`);
                yield item;
            }
        }(),// as (...args: any[]) => AsyncGenerator<any>,
        { _M, }
    ));
};
//         const gen = generator(...args);
//         console.debug(`wrapModuleGeneratorMetadata(): gen=${nodeUtil.inspect(Object.entries(gen))}`);
//         return ({
//             ...gen,
//             _M: nodePath.basename(__filename.slice(__dirname.length + 1))
//         }) as WrappedModuleGenerator<AsyncIterable<any>>;// & { _M: string });//Generator<any>);
//     });
// }
// type FileArtefact = DiscriminatedModel<File |Directory |Unknown>;

// for await (const _ of Artefact.stream(FileSystem.walk({ path: "./" }))) {
    
// }

// async function main() {
//     db.configure(() => new db.MongoStorage("mongodb://mongo:mongo@localhost:27017/"));
//     const store = await db.storage.store("fileSystemEntries");
//     for await (const fsEntry of Artefact.stream(FileSystem.walk({ path: "./" }))) {
//         const dbEntry = await store.findOne;
//         // if (!dbEntry.hash) {

//         // }
//     }
// }

// main();
