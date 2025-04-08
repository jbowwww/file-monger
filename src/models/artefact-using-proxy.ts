import * as nodePath from "node:path";

import debug from "debug";
import { Aspect, AspectFn, Choose, Constructor, DeepProps, mapObject } from ".";
import { Filter } from "mongodb";
import { get } from "../prop-path";
import { isDate } from "node:util";
import { isProxy } from "node:util/types";
import * as nodeUtil from "node:util";
import { AbstractConstructor } from "./index";
const log = debug(nodePath.basename(module.filename));
const logProxy = log.extend("Proxy");

export enum UpdateTimestamps {
    create ="create",
    check = "check",
    update = "update",
};

// export type Artefact<T = {}> = {
//     // (aspectFn: AsyncFunction<any> | Constructor<any>): Aspect;
// } & T;

export const isArtefact = (value: any): value is Artefact => typeof value._ts === "object" && value._ts instanceof Timestamps && typeof value._v === "number";

const updateTimestamps = (updateType: UpdateTimestamps, _: Artefact<any>) => { 

};

// export class Artefact<T extends {}> {
//     _id?: string;
//     _ts: TimestampTreeRoot<T>;
//     _v: number;
//     _e?: Error | Error[];
//     constructor(data?: T | Artefact<T>, enableTimestamps: boolean = true) => {
//     const _: Artefact = { _ts: new Timestamps(), _v: 1, ...data } as Artefact<T>;
//     return _;
// };

// Artefact.stream = async function* stream<I, T extends {}>(source: AsyncIterable<I>, transform: (...args: [I]) => T) {
//     for await (const item of source) {
//         yield /* transform ?  */this(transform(...[item]))/*  : this(item, true) */;
//     }
// };

export type TimestampTree<T> =  (T extends {} ? {
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
    [K: string]: any;//AspectFn | Constructor<Aspect<string, any>> | string | number | object | 
};
export type ArtefactSchema<T extends ArtefactTypes> = {
    [K in keyof T]?: T[K] extends Constructor<any> ? InstanceType<T[K]> : T[K];
};

export type Artefact<T extends ArtefactTypes> = {
    _id?: string;
    _ts: Timestamps<T>;
    _v: number;
    _e?: Error | Error[];
} & ArtefactSchema<T>;

export const Artefact = {
    Type<T extends ArtefactTypes, S extends ArtefactSchema<T> = ArtefactSchema<T>, I = Partial<S>>(types: T, createFn: (init: I) => T): (init: I) => Artefact<T> {
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
    }
        
}
        // declare prototype: Artefact & {
        //     constructor: typeof Artefact;
        //     __is_Artefact: true;
        // };
    
        static isArtefact = (o: any): o is Artefact =>
            typeof o === "object" && (
                o.__is_Artefact || 
                typeof o._id === "string" ||
                typeof o._id === "object" ||
                o.prototype === Artefact.prototype);
    
        readonly isArtefact = true;
        _id?: string;
        _v: number;
        _ts!: TimestampTree<{}>;
        _e?: Error[];

        #modifiedPaths: Set<string> = new Set();
    
        constructor(data?: Partial<Artefact>, enableTimestamps: boolean = true) {
            log("new Artefact(): data=%O enableTimestamps=%b", data, enableTimestamps);
            this._id = data?._id;
            this._v = data?._v ?? 1;
            this._ts = data?._ts ?? new Timestamps<A>();
            this._e = data?._e;
            const notifyChangeCallback = (propPath: string, oldValue: any, newValue: any, isModified: boolean) => {
                // const valueDiff = diff(oldValue, newValue);
                // const isModified = Object.keys(valueDiff).length > 0;
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
    
        get Query(): ArtefactInstanceQueries<Artefact, {}> {
            return mapObject(
                this.prototype.constructor.Query,
                ([K, V]) => ([K, () => ([K, V(this)])]));
        }
    
        static Query: ArtefactStaticQueries<Artefact, {}> = Object.assign(
            <A extends Artefact>(propPath: DeepProps<A>, value: A | Choose<A, DeepProps<A>>) => {
                return ({ [propPath]: this.isArtefact(value) ? get(value, propPath) : value, });
            }, {
                byUnique: <A extends Artefact>(_: A) => ({ "_id": _._id }) as Filter<A>,
                byId: <A extends Artefact>(_: A) => ({ "_id": _._id }) as Filter<A>,
            });
    
        static async* stream<I, T extends {}>(this: Constructor<Artefact<T>>, source: AsyncIterable<I>, transform?: (...args: [I]) => T) {
            for await (const item of source) {
                yield new this(transform?.(...[item]) ?? item, true);
            }
        }
    }
    
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
    ): Artefact<S> => {
        if (!rootTarget) { //Artefact.isArtefact(_)) {
            rootTarget ??= target;
        }
        logProxy("ArtefactProxy(): target=${%O} prefix=%s, rootTarget===target=%b targets.has(target)=%b", target, prefix, rootTarget===target, targets.has(target));
            return targets.has(target) ? targets.get(target) : targets.set(target, new Proxy(target as {}, {
            set(target: { [K: string]: any; }/* A | Choose<A, DeepProps<A>> */, K: string, newValue: any, receiver: A) {
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
                        if (Reflect.set(target, K as keyof A, newValue, target/* receiver *//* this */)) {
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
            get(target: { [K: string]: any; }, K: string, receiver: A) {
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
    }
    
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
    
    export type ArtefactStaticQueryFn<A extends Artefact> = (_: A) => Filter<A>;
    export type ArtefactInstanceQueryFn<A extends Artefact> = () => Filter<A>;
    export type ArtefactStaticExtensionQueries<A extends Artefact> = {
        [K: string]: ArtefactStaticQueryFn<A>;
    };
    export type ArtefactInstanceExtensionQueries<A extends Artefact> = {
        [K: string]: ArtefactInstanceQueryFn<A>;
    };
    export type ArtefactStaticQueries<A extends Artefact, Q extends ArtefactStaticExtensionQueries<A>> = Q & {
        byUnique: ArtefactStaticQueryFn<A>;     // derived classes can redefine this to return one of several possible queries that uniquely identify the Artefact (e.g. _id ?? path ?? ...)
        byId: ArtefactStaticQueryFn<A>;
    };
    export type ArtefactInstanceQueries<A extends Artefact, Q extends ArtefactStaticExtensionQueries<A>> = {
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
    