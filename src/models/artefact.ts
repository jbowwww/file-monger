import * as nodePath from "node:path";
import * as nodeUtil from "node:util";
import { isProxy, isDate } from "node:util/types";
import { AsyncFunction, Constructor, mapObject, NamespacedAspect as ArtefactNamespacedProperty } from ".";
import { Filter } from "mongodb";
import { get } from "../prop-path";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));
const logProxy = log.extend("Proxy");

export type TimestampTree<T> = (T extends {} ? {
    [K in keyof T]: TimestampTree<T[K]>;
} : {}) & {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted: Date | undefined;
};

export class Timestamps<T extends {} = {}> {
    _created: Date;
    _checked: Date;
    _updated: Date;
    _deleted: Date | undefined;
    public constructor(data: Partial<Timestamps<T>> = {}) {
        const { _created, _checked, _updated, _deleted, ...d } = data;
        this._created = _created ?? new Date();
        this._checked = _checked ?? this._created;
        this._updated = _updated ?? this._created;
        this._deleted = _deleted;
    }
}

export enum ArtefactToDataOption {
    Full = "Full",
    Modified = "Modified"
};

export type ArtefactToDataOptions = {
    ToData: ArtefactToDataOption;
};
export const ArtefactToDataOptions: {
    default: ArtefactToDataOptions;
} = {
    default: {
        ToData: ArtefactToDataOption.Full,
    }
};

export type ArtefactTypes = {
    [K: string]: Constructor<any> | AsyncFunction | string | number | object;//AspectFn | Constructor<Aspect<string, any>> | string | number | object | 
};
export type ArtefactSchema<T extends ArtefactTypes> = {
    [K in keyof T]?:
    T[K] extends Constructor<any> ? InstanceType<T[K]> :
    T[K] extends AsyncFunction ? Awaited<ReturnType<T[K]>> :
    T[K];
};

// export type Artefact<S extends ArtefactSchema<{}> = ArtefactSchema<{}>> = {
//     _id?: string;
//     _ts: Timestamps<S>;
//     _v: number;
//     _e?: Error | Error[];
// } & S;

// export const ArtefactType = /* <
//         T extends ArtefactTypes,
//         S extends ArtefactSchema<T> = ArtefactSchema<T>,
//         I = Partial<S>
//     > */(
//         types: T,
//         createFn: (init: I) => S
//     ): (init: I) => Artefact<S> {
//         return function Artefact(init: I): Artefact<S> {
//             const _ = { ...createFn(init), _ts: new Timestamps(), _v: 1, };
//             return ChangeTrackingProxy<T, S>(
//                 _,
//                 (path: string, oldValue: any, newValue: any, isModified: boolean) => {
//                     const _ts = get(_._ts, path, true, new Timestamps());
//                     if (isModified) {
//                         _ts._updated = new Date();
//                     } else {
//                         _ts._checked = new Date();
//                     }
//                 });
//         };
//     }

// }

export const isArtefact = (o: any): o is Artefact => o && typeof o === "object" && o instanceof Artefact;

export abstract class Artefact/* <
    T extends ArtefactTypes,
    S extends ArtefactSchema<T> = ArtefactSchema<T>,
    I = Partial<S>
> */ {
    
    static isArtefact = isArtefact;

/* 
    static Type<
        T extends ArtefactTypes,
        S extends ArtefactSchema<T> = ArtefactSchema<T>,
        I = Partial<S>
    >(
        types: T,
        createFn: (init: I) => S
    ): (init: I) => Artefact<S> {
        return function Artefact(init: I): Artefact<S> {
            const _ = { ...createFn(init), _ts: new Timestamps(), _v: 1, };
            return ChangeTrackingProxy<T, S>(
                _,
                (path: string, oldValue: any, newValue: any, isModified: boolean) => {
                    const _ts = get(_._ts, path, true, new Timestamps());
                    if (isModified) {
                        _ts._updated = new Date();
                    } else {
                        _ts._checked = new Date();
                    }
                });
        };
    } */
    
    // export static is = Symbol("isArtefact: flag with value true to indicate this is an instance of Artefact");
    // export static modifiedPaths = Symbol();

    _id: string | undefined;
    _v: number;
    _ts!: TimestampTree<{}>;
    _e: Error[] | undefined;

    #modifiedPaths: Set<string> = new Set();

    constructor(data?: Partial<Artefact>, enableTimestamps: boolean = true) {
        log("new Artefact(): data=%O enableTimestamps=%b", data, enableTimestamps);
        this._id = data?._id;
        this._v = data?._v ?? 1;
        this._ts = data?._ts ?? new Timestamps<typeof this>();
        this._e = data?._e;
        const notifyChangeCallback = (propPath: string, oldValue: any, newValue: any, isModified: boolean) => {
            // const valueDiff = diff(oldValue, newValue);
            // const isModified = Object.keys(valueDiff).length > 0;
            const _ts = get(this._ts, propPath, true, new Timestamps());
            if (isModified) {
                this.markUpdated(propPath);
            } else {
                this.markChecked(propPath);
            }
        };
        const r = enableTimestamps ? ChangeTrackingProxy(this, notifyChangeCallback) as Artefact : this;    // possibly needs a ignoreProps array parameter for ArtefactProxy - pass , ["_id", "_ts", "_E"]
        Object.assign(r, data);
        return r;
    }

    enableTimestamps(enableTimestamps: boolean = true) { }

    public markChecked(propPath: string, checked?: Date) {
        const _ts = get(this._ts, propPath);
        _ts._checked = checked ?? new Date();
    }

    public markUpdated(propPath: string, updated?: Date) {
        const _ts = get(this._ts, propPath);
        _ts._updated = updated ?? new Date();
        _ts._checked = _ts._updated;
    }

    public markDeleted(propPath: string, deleted?: Date) {
        const _ts = get(this._ts, propPath);
        _ts._deleted = deleted ?? new Date();
        _ts._updated = _ts._deleted;
        _ts._checked = _ts._updated;
    }

    toData<A extends Artefact>(optionsOrModifiedOption?: Partial<ArtefactToDataOptions> | boolean) {
        // if (Artefact.isArtefact(originalOrOptions)) {
        const options = {
            ...ArtefactToDataOptions.default,
            ...(typeof optionsOrModifiedOption === "object" ? { ToData: optionsOrModifiedOption.ToData } : {}),
        };
        // } else {
        //     // if (options !== undefined) throw new TypeError("Artefact.toData(): ArtefactToDataOptions should be the first and only parameter, or the second parameter preceeded by an Artefact instance");
        //     options = { ...ArtefactToDataOptions.default, ...originalOrOptions, ToData: ArtefactToDataOption.Diff, };
        // }
        // return filterObject(this, ([K, V]) => {
        // const d = Object.getOwnPropertyDescriptor(this, K);
        // console.debug("K = ${K as string}, d = ${nodeUtil.inspect(d)}");
        const descriptors = Object.getOwnPropertyDescriptors(this);
        const values = /* filterObject( */mapObject(
            descriptors as Record<string | number, PropertyDescriptor>,
            ([K, V]) => K !== "_id" && K !== "_ts" && K !== "_E" && V.value || (V.get && V.set),
            ([K, V]) => ([K, V.value ?? V.get?.()]));//, ([K, V]) => V);
        // console.debug("#modifiedPaths=${nodeUtil.inspect(this._modifiedPaths.values())}");  //descripttors = ${nodeUtil.inspect(descriptors, { getters: true})}\n
        return values;//filterObject(values, ([K, V]) => this._modifiedPaths.has(K as string));
    }; // should filter out getters (for now - TODO: decorators to opt-in getters)
    // //(!!d?.value || (d?.get && d?.set && !!d?.get())) ?? false;
    // });

    [nodeUtil.inspect.custom](depth: number, inspectOptions: nodeUtil.InspectOptions, inspect: typeof nodeUtil.inspect) {
        return inspect(this.toData(), inspectOptions);
    }

    static async* stream<I, T extends {}>(this: Constructor<Artefact>, source: AsyncIterable<I>, transform?: (...args: [I]) => T) {
        for await (const item of source) {
            yield new this(transform?.(...[item]) ?? item, true);
        }
    }
};

export declare namespace Artefact {
    export type WithId<A extends Artefact> = Omit<A, "_id"> & { _id: string; };
};

let _enableTimestamps = true;
const targets = new WeakMap();

export type ChangeNotifyCallback = (path: string, oldValue: any, newValue: any, isModified: boolean) => void;

export const ChangeTrackingProxy = <T extends ArtefactTypes, S extends ArtefactSchema<T> = ArtefactSchema<T>>(
    target: { [K: string]: any; },
    notifyCallback: ChangeNotifyCallback,
    prefix = "",
    rootTarget?: { [K: string]: any; }
): Artefact => {
    if (!rootTarget) { //Artefact.isArtefact(_)) {
        rootTarget ??= target;
    }
    logProxy("ArtefactProxy(): target=${%O} prefix=%s, rootTarget===target=%b targets.has(target)=%b", target, prefix, rootTarget === target, targets.has(target));
    return targets.has(target) ? targets.get(target) : targets.set(target, new Proxy(target as {}, {
        set(target: { [K: string]: any; }/* A | Choose<A, DeepProps<A>> */, K: string, newValue: any, receiver: S) {
            logProxy("ArtefactProxy().set: target=%O K=%s, rootTarget===target=%b", target, K, rootTarget === target);
            let modified = false;
            const oldValue = Reflect.get(target, K, target);//_[K /* as keyof (A | Choose<A, DeepProps<A>>) *//*  as keyof A */];
            if (oldValue !== newValue) {
                if (typeof oldValue === "object" && typeof newValue === "object" && !(isDate(newValue) || newValue instanceof Date)) {
                    let isModified = false;
                    isModified ||= Reflect.set(/* oldValue as {} */target, K, newValue, this);
                    notifyCallback(prefix + K, oldValue, newValue, isModified);
                    // rootTarget?.markUpdated(prefix + K);
                } else {
                    if (Reflect.set(target, K as keyof S, newValue, target/* receiver *//* this */)) {
                        notifyCallback(prefix + K, oldValue, newValue, true);
                        // rootTarget?.markUpdated(prefix + K);
                        return true;
                    }
                    notifyCallback(prefix + K, oldValue, newValue, false);
                    // rootTarget?.markChecked(prefix + K);
                    return true;//false;
                }
            } else {
                notifyCallback(prefix + K, oldValue, newValue, false);
                // rootTarget?.markChecked(prefix + K);
                return true;//false;
            }
            throw new Error("Should not reach here! ${__filename}: ArtefactProxy:195");
        },
        get(target: { [K: string]: any; }, K: string, receiver: Artefact) {
            if (K === "updateTimestamps") {
                return function updateTimestamps(updateTimestamps: boolean = true) {
                    _enableTimestamps = updateTimestamps;
                }
            } else {
                const value = Reflect.get(target, K, target);
                return value !== null && value !== undefined && typeof value === "object" &&
                    !targets.has(this) && typeof value === "function" &&
                    !isProxy(value) && !(isDate(value) || value instanceof Date) ?
                    typeof value === "function" ? value.bind(target) :
                        ChangeTrackingProxy(value, notifyCallback, K + ".", rootTarget ?? target) : value;
            }
        }
    })).get(target);
};

export type QueryableArtefact<
    A extends Artefact,
    Q extends ArtefactStaticExtensionQueries<A> = ArtefactStaticExtensionQueries<A>
> = A & {
    Query: ArtefactInstanceQueries<A, Q>;
};

export type ArtefactFn<
    A extends Artefact,
    C extends any[],
> = (...args: C) => A;

export type ArtefactStaticQueryFn<A extends Artefact, T extends any = any> = (_: A | T) => Filter<A>;
export type ArtefactInstanceQueryFn<A extends Artefact> = () => Filter<A>;
export type ArtefactStaticExtensionQueries<A extends Artefact> = {
    [K: string]: ArtefactStaticQueryFn<A>;
};
export type ArtefactInstanceExtensionQueries<A extends Artefact> = {
    [K: string]: ArtefactInstanceQueryFn<A>;
};
export type ArtefactStaticQueries<A extends Artefact, Q extends ArtefactStaticExtensionQueries<A> = {}> = 
    (this: typeof Aspect, aspectFilter: Filter<Aspect>) => ArtefactNamespacedProperty<Filter<Aspect>> &
    Q & {
        byUnique: ArtefactStaticQueryFn<A>;     // derived classes can redefine this to return one of several possible queries that uniquely identify the Artefact (e.g. _id ?? path ?? ...)
        byId: ArtefactStaticQueryFn<A>;
    };
export type ArtefactInstanceQueries<A extends Artefact, Q extends ArtefactStaticExtensionQueries<A> = {}> =
    (this: Artefact, aspectFilter: Filter<Aspect>) => ArtefactNamespacedProperty<Filter<Aspect>> & {
        [K in keyof Q]: ArtefactInstanceQueryFn<A>;
    } & {
        byUnique: ArtefactInstanceQueryFn<A>;     // derived classes can redefine this to return one of several possible queries that uniquely identify the Artefact (e.g. _id ?? path ?? ...)
        byId: ArtefactInstanceQueryFn<A>;
    };

export type ArtefactStaticMethods<A extends Artefact, Q extends ArtefactStaticExtensionQueries<A>> = {
    stream<I>(source: AsyncIterable<I>): AsyncGenerator<QueryableArtefact<A, Q>>;
    Query: ArtefactStaticQueries<A, Q>;
};

export type QueryableArtefactFn<
    A extends Artefact,
    C extends any[],
    Q extends ArtefactStaticExtensionQueries<A>,
> = {
    (...args: C): QueryableArtefact<A, Q>;
} & ArtefactStaticMethods<A, Q>;
