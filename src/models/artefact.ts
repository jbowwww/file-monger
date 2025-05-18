import * as nodePath from "node:path";
import * as nodeUtil from "node:util";
import { isProxy, isDate } from "node:util/types";
import { Aspect, AsyncFunction, Constructor, mapObject, NamespacedAspect as ArtefactNamespacedProperty, Choose, DeepProps, isConstructor, AspectType, AbstractConstructor } from ".";
import { Condition, Filter, OperationOptions, UpdateFilter } from "mongodb";
import { get } from "../prop-path";

import debug from "debug";
import { string, number, boolean } from "yargs";
import { flattenPropertyNames } from "../db";
const log = debug(nodePath.basename(module.filename));
const logProxy = log.extend("Proxy");

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

export type ArtefactQueryFn<TArtefact extends Artefact> = <
    TAspect extends Aspect = Aspect,
    PArtefact extends DeepProps<TArtefact> = DeepProps<TArtefact>,
    PAspect extends DeepProps<TAspect> = DeepProps<TAspect>,
>(
    this: typeof Artefact,
    // An Aspect class (constructor fn) or its type name (which will also be the property name inside this Artefact) (propertyPathOrValue must not be undefined), or
    // A property path direct on the artefact (if it is typeof string && contains dot notation or propertyPathOrValue is not an instanceof Aspect - valueOrOptions should then be undefined)
    aspectTypeOrName?: string | typeof Aspect /* AspectType<TAspect> *//* Constructor<TAspect> */ /* | DeepProps<WithId<TArtefact>> */,
    // A property path (dot notation for nested props) into the Aspect type specified above (must be a class /ctor fn, not a string), or
    // A mongodb Condition<A> ({ $eq: { ... } }, { $gt: { ... } }, etc...), or
    // an instanceof Aspect (or partial) to filter for equality with above aspect as a whole, or
    // a primitive for equality with the property path on artefact specified above (does this get included in the mongodb type Condition<> ? to save me also adding | any or something)
    propertyPathOrValue?: /* DeepProps<WithId<TAspect>> */ string | Condition<Choose<TArtefact, PArtefact>> | Condition<Choose<TAspect, PAspect>>,// | Partial<TAspect>,
    // A mongodb Condition<A> ({ $eq: { ... } }, { $gt: { ... } }, etc..., or
    // instanceof Aspect (or partial) or primitive value for equality comparison with above, or
    // OperationOptions
    valueOrOptions?: Condition<Choose<TArtefact, PArtefact>>,
    // OperationOptions
    options?: OperationOptions
) => Filter<TArtefact>;

export type ArtefactQueriesObject<A extends Artefact /* = Artefact */> = {
    byUnique: ArtefactStaticQueryFn<A>; //(this: ArtefactStaticQueries, _: Artefact) => Filter<A>;
    byId: ArtefactStaticQueryFn<A>; //(_: Artefact): 
}
export type ArtefactQueries<A extends Artefact /* = Artefact */> = ArtefactQueryFn<A> & ArtefactQueriesObject<A>;

export const isArtefact = function isArtefact<A extends Artefact = Artefact>(this: AbstractConstructor<A> | void, o: any): o is A {
    return o && typeof o === "object" && (this !== undefined ? o instanceof this : o instanceof Artefact);
};

export abstract class Artefact {
    
    static is = isArtefact;

    static from<A extends Artefact>(this: Constructor<A>, aspect: Aspect) {
        return Object.assign(new this(), { [aspect._T as keyof A]: aspect, });
    }
    
    update<A extends Artefact>(this: A, aspect: Aspect) {
        Object.assign(this, { [aspect._T]: aspect, });
        return this;
    }

    isArtefact: true = true;
    _id?: string;
    _v: number;
    _ts!: TimestampTree<{}>;
    _e?: Error[];

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
        const options = {
            ...ArtefactToDataOptions.default,
            ...(typeof optionsOrModifiedOption === "object" ? { ToData: optionsOrModifiedOption.ToData } : {}),
        };
        const descriptors = Object.getOwnPropertyDescriptors(this);
        const values = /* filterObject( */mapObject(
            descriptors as Record<string | number, PropertyDescriptor>,
            ([K, V]) => K !== "_id" && K !== "_ts" && K !== "_E" && V.value || (V.get && V.set), // in an Artefact, only properties that are fields or have both getters and setters are serialized (may not even really need to check getters/setters except for in an Aspect)
            ([K, V]) => ([K, V.value ?? V.get?.()]));
        return values;
    };

    [nodeUtil.inspect.custom](depth: number, inspectOptions: nodeUtil.InspectOptions, inspect: typeof nodeUtil.inspect) {
        return inspect(this.toData(), inspectOptions);
    }

    static async* stream<I, T extends {}>(this: Constructor<Artefact>, source: AsyncIterable<I>, transform?: (...args: [I]) => T) {
        for await (const item of source) {
            yield new this(transform?.(...[item]) ?? item, true);
        }
    }

    get Query() {
        return ({
            byId: () => ({ "_id": this._id }),
        })
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
export type ArtefactStaticQueries<A extends Artefact = Artefact, Q extends ArtefactStaticExtensionQueries<A> = {}> = 
    /* (this: typeof Artefact, aspectFilter: Filter<Artefact>) => ArtefactNamespacedProperty<Filter<Artefact>> &
    Q & */ {
        byUnique: ArtefactStaticQueryFn<A>;     // derived classes can redefine this to return one of several possible queries that uniquely identify the Artefact (e.g. _id ?? path ?? ...)
        byId: ArtefactStaticQueryFn<A>;
    };
export type ArtefactInstanceQueries<A extends Artefact = Artefact, Q extends ArtefactStaticExtensionQueries<A> = {}> =
    (this: Artefact, aspectFilter: Filter<Artefact>) => ArtefactNamespacedProperty<Filter<Artefact>> & {
        [K in keyof Q]: ArtefactInstanceQueryFn<A>;
    } & {
        byUnique: ArtefactInstanceQueryFn<A>;     // derived classes can redefine this to return one of several possible queries that uniquely identify the Artefact (e.g. _id ?? path ?? ...)
        byId: ArtefactInstanceQueryFn<A>;
    };

export type ArtefactStaticMethods<A extends Artefact = Artefact, Q extends ArtefactStaticExtensionQueries<A> = {}> = {
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
