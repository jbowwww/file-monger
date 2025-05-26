import * as nodePath from "node:path";
import { Filter, ObjectId } from "mongodb";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type TimestampTree<T> = (T extends {} ? {
    [K in keyof T]: TimestampTree<T[K]>;
} : {}) & {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted?: Date;
};

export class Timestamps<T extends {} = {}> {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted?: Date;
    public constructor(data: Partial<Timestamps<T>> = {}) {
        const { _created, _checked, _updated, _deleted, ...d } = data;
        this._created = _created ?? new Date();
        this._checked = _checked ?? this._created;
        this._updated = _updated ?? this._created;
        this._deleted = _deleted;
    }
}

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

// export const Artefact = {
//     async create<A extends Artefact>(data: A): Promise<A> {

//     }
// }    constructor(data?: Partial<Artefact>, enableTimestamps: boolean = false) {
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
