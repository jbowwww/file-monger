import * as nodePath from "node:path";
import { Filter, ObjectId } from "mongodb";
import { KeyValuePair, mapObject } from ".";
// import { get } from "../prop-path";
// import { ChangeTrackingProxy } from "../change-tracking-proxy";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export interface ArtefactSchema extends Artefact {
    /* model modules should use interface merging to add types to this interface */
}

export type Tree<T> = {
    [K in keyof T]: TimestampTree<T[K]>;
};

export type TimestampTree<T> = (T extends { [K: string]: any; } ? {
    [K in keyof T]: TimestampTree<T[K]>;
} : {}) & {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted?: Date;
};

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

export type Artefact = {
    isArtefact: true;
    _id?: ObjectId;
    _v: number;
    _ts: TimestampTree<{}>;
    _e?: Error[];
};

export type ArtefactQueryFn<A extends Artefact> = (_: A) => Filter<A>;

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
