import * as nodePath from "node:path";
import { Filter, ObjectId } from "mongodb";
import { AnyParameters, Aspect, AspectClass, KeyValuePair, mapObject, MaybeAsyncFunction } from ".";
// import { get } from "../prop-path";
// import { ChangeTrackingProxy } from "../change-tracking-proxy";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

// export type DataMemberFn</* K extends PropertyKey = string | symbol,  */M extends ArtefactModel, A extends Aspect = Aspect> = (_: M) => A | Promise<A>;
export type DataMemberFn<M extends Artefact = Artefact, A extends Aspect = Aspect> = (_: Artefact) => A | Promise<A>;

export type ArtefactSchema<A extends Artefact> = { [K in keyof Omit<A, keyof Artefact>]: MaybeAsyncFunction<AnyParameters, A[K]> | A[K]; };
// extends PropertyKey = string | symbol, M extends ArtefactModel = ArtefactModel>

export type ArtefactSchemaMember<A extends Aspect = Aspect> = AspectClass<A> | DataMemberFn<Artefact, A>;
// export type Artefact = { };
export type ArtefactSchemaMemberType<M extends ArtefactSchemaMember> = M extends ArtefactSchemaMember<infer A> ? A : never;
// export type ArtefactModel<S extends {} = {}> = { [K in keyof S]: ArtefactSchemaMemberType<S[K]>; };

// export type ArtefactObjectParameter<M extends ArtefactModel> = {
//     [K in keyof M]: M[K] extends AspectType ? M[K] : M[K] extends DataMemberFn<M, any> ? ReturnType<M[K]> : never;
// };


export interface ArtefactSchemaMaster extends Artefact {}

export type Tree<T, D> = (T extends { [K: string]: any; } ? {
    [K in keyof T]: Tree<T[K], D>;
} : {}) & D;

export type TimestampTree<T> = Tree<T, {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted?: Date;
}>;

// Create a TimestampTree with the same prop name heirarcy as data, if supplied
export const makeTimestampTree = <T extends { [K: string]: any; }>(data?: T) => {
    // const _created = data?._created ?? new Date();
    // const _checked = data?._checked ?? _created;
    // const _updated = data?._updated ?? _created;
    // const _deleted = data?._deleted;
    const _created = new Date();
    const tree: TimestampTree<T> = Object.assign(
        Object.create(null), 
        mapObject<T, TimestampTree<T>>(
            data ?? {} as any,
            ([K, V]) => typeof K === "string" && !K.startsWith("_"),
            ([K, V]) => ([K as string, makeTimestampTree(data![K as string])]) as KeyValuePair<string, any>), {
        _created,
        // _checked: _created,
    });
    return tree;
};

export class Timestamps<T extends {} = {}> {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted?: Date;
    public constructor(data: Partial<Timestamps<T>> = {}) {
        const { _created, _checked, _updated, _deleted, ...d } = data;
        this._created = data._created ?? new Date();
        this._checked = data._checked ?? this._created;
        this._updated = data._updated ?? this._created;
        this._deleted = data._deleted;
    }
}

// export class TimestampTree<T extends {}> extends Timestamps {

//     constructor(data: TimestampTree<T>) {
//         super(data);

//     }

// }

export const hasId = <A extends Artefact = Artefact>(_: any): _ is A => "_id" in _;

export const isArtefact = <A extends Artefact = Artefact>(o: any): o is A => o && o.isArtefact;

export type Artefact/* <S extends Artefact = ArtefactSchemaMaster> */ = /* ArtefactModel<S> & */ {
    isArtefact: true;
    _id?: ObjectId;
    _v: number;
    _ts: TimestampTree<{}>;
    _e?: Error[];
};

export type ArtefactQueryFn<A extends Artefact> = (_: A) => Filter<A>;

// export class Artefact<T extends { [K: string]: any; }> {
//     isArtefact: true = true;
//     _id?: ObjectId | undefined;
//     _v: number = 0;
//     _ts: TimestampTree<Partial<T>>;
//     _e?: Error[] | undefined;
//     constructor(data?: Partial<T>) {
//         if (data) {
//             Object.assign(this, data);
//         }
//         this._ts = data ? makeTimestampTree(data) : {} as TimestampTree<Partial<T>>;
//     }
// }

// export class Artefact {
//     constructor(data?: Partial<Artefact>, enableTimestamps: boolean = false) {
//         log("new Artefact(): data=%O enableTimestamps=%b", data, enableTimestamps);
//         Object.assign(this, data);
//         this._v ??= 1;
//         this._ts ??= new Timestamps<typeof this>();
//         const notifyChangeCallback = (propPath: string, oldValue: any, newValue: any, isModified: boolean) => {
//             // const valueDiff = diff(oldValue, newValue);
//             // const isModified = Object.keys(valueDiff).length > 0;
//             const _ts = get(this._ts, propPath, true, new Timestamps());
//             if (isModified) {
//                 this.markUpdated(propPath);
//             } else {
//                 this.markChecked(propPath);
//             }
//         };
//         const r = enableTimestamps ? ChangeTrackingProxy(this, notifyChangeCallback) as Artefact : this;    // possibly needs a ignoreProps array parameter for ArtefactProxy - pass , ["_id", "_ts", "_E"]
//         return r;
//     }

//     static async create<A extends Artefact>(data: A): Promise<A> {
//         throw new Error(`Artefact.create not implemented`);
//     }

//     enableTimestamps(enableTimestamps: boolean = true) { }

//     public markChecked(propPath: string, checked?: Date) {
//         const _ts = get(this._ts, propPath);
//         _ts._checked = checked ?? new Date();
//     }

//     public markUpdated(propPath: string, updated?: Date) {
//         const _ts = get(this._ts, propPath);
//         _ts._updated = updated ?? new Date();
//         _ts._checked = _ts._updated;
//     }

//     public markDeleted(propPath: string, deleted?: Date) {
//         const _ts = get(this._ts, propPath);
//         _ts._deleted = deleted ?? new Date();
//         _ts._updated = _ts._deleted;
//         _ts._checked = _ts._updated;
//     }
