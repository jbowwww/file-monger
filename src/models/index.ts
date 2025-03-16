import { Filter } from "mongodb";
import * as nodeUtil from 'node:util';
import { get } from "../prop-path";
import { isDate, isProxy } from "node:util/types";
import { getUpdates } from "../db";
import { diff } from "deep-object-diff";

export type PartiallyRequired<T extends {}, R extends keyof T> = Required<Pick<T, R>> & Partial<Omit<T, R>>;

export type KeyValuePair<K extends PropertyKey = PropertyKey, V = unknown> = [K: K, V: V];
export type FilterFn<T extends {}> = (kv: KeyValuePair<keyof T, T[keyof T]>) => boolean;
export type MapFn<T extends {}, TOut extends {}> = (kv: KeyValuePair<keyof T, T[keyof T]>) => KeyValuePair<keyof TOut, TOut[keyof TOut]>;
export function mapObject<T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, map: MapFn<T, TOut>): TOut;
export function mapObject<T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, filter: FilterFn<T> | MapFn<T, TOut>, map: MapFn<T, TOut>): TOut;
export function mapObject<T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, filterOrMap: FilterFn<T> | MapFn<T, TOut>, map?: MapFn<T, TOut>): TOut {
    return Object.fromEntries((Object.entries(o) as KeyValuePair<keyof T, T[keyof T]>[])
        .filter(map ? filterOrMap : () => true)
        .map(map ?? ((kv: KeyValuePair<keyof T, T[keyof T]>) => kv as KeyValuePair<PropertyKey, any>))) as TOut;
}
export function filterObject<T extends {}>(o: T, filter: FilterFn<T>): Partial<T> {
    return Object.fromEntries((Object.entries(o) as KeyValuePair<keyof T, T[keyof T]>[]).filter(filter)) as Partial<T>;
}

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Choose<
  T extends Record<string | number, any>,
  K extends string | number
> = K extends `${infer U}.${infer Rest}` ? Choose<T[U], Rest> : T[K];
// export type Choose<
//   T extends Record<string | number, any>,
//   K extends DeepProps<T>
// > = K extends `${infer U}.${infer Rest}` ? Choose<T[U], Rest> : T[K];

export type Join<K extends string | number, P extends string | number> = `${K}.${P}`
export type DeepProps<
  T extends Record<string | number, any>,
  K extends Exclude<keyof T, symbol> = Exclude<keyof T, symbol>,
  U extends string | number = ''
> = T[K] extends Record<string | number, unknown>
  ?
      | (U extends '' ? K : U)
      | DeepProps<
          T[K],
          Exclude<keyof T[K], symbol>,
          U extends ''
            ? Join<K, Exclude<keyof T[K], symbol>>
            : U | Join<U, Exclude<keyof T[K], symbol>>
        >
  : U

export type Constructor<T> = { new(...args: any[]): T; prototype: T; };
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
// export const isConstructor(ctor: any): ctor is Constructor => (Function.isPrototypeOf(ctor)))

export type Id<T> = { [K in keyof T]: T[K] };
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type Aspect<_T extends string | Symbol, T extends {} = {}> = { _T: _T } & T;
export const isAspect = <A extends Aspect<any> = Aspect<any>>(aspect: any): aspect is A => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";
export type AspectFn<A extends Aspect<any> = Aspect<any>> = (...args: any[]) => A;
export type Timestamped<T> = { _ts: Date; } & T;

export class Timestamps {
    created: Date;
    checked: Date;
    updated: Date;
    deleted?: Date;

    public constructor(data: Partial<Timestamps> = {}) {
        this.created = data.created ?? new Date();
        this.checked = data.checked ?? this.created;
        this.updated = data.updated ?? this.created;
        this.deleted = data.deleted;
    }

    public markChecked(checked?: Date) {
        this.checked = checked ?? new Date();
    }
    
    public markUpdated(updated?: Date) {
        this.updated = updated ?? new Date();
        this.checked = this.updated;
    }
    
    public markDeleted(deleted?: Date) {
        this.deleted = deleted ?? new Date();
        this.updated = this.deleted;
        this.checked = this.updated;
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

export abstract class Artefact {
    declare prototype: Artefact & {
        constructor: typeof Artefact;
        __is_Artefact: true;
    };

    static isArtefact = (o: any): o is Artefact =>
        typeof o === "object" && (
            o.__is_Artefact || 
            typeof o._id === "string" ||
            typeof o._id === "object" ||
            o.prototype === Artefact.prototype);

    _id?: string;
    _ts!: Timestamps;
    _E?: Error[];//Array<Error>;

    #modifiedPaths: Set<string> = new Set();

    [K: string]: any;

    constructor(data?: Partial<Artefact>, enableTimestamps: boolean = true) {
        console.debug(`new Artefact(): data=${nodeUtil.inspect(data)} updateTimestamps=${enableTimestamps}`);
        this._id = data?._id;
        this._ts = data?._ts ?? new Timestamps();
        this._E = data?._E;
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
        this._ts.markChecked(checked);
    }
    
    public markUpdated(propPath: string, updated?: Date) {
        this.#modifiedPaths.add(propPath);
        this._ts.markUpdated(updated);
    }
    
    public markDeleted(deleted?: Date) {
        this._ts.markDeleted(deleted);
    }

    toData<A extends Artefact>(optionsOrModifiedOption?: Partial<ArtefactToDataOptions> | boolean) {
        // if (Artefact.isArtefact(originalOrOptions)) {
        const options = {
            ...ArtefactToDataOptions.default, 
            ...(typeof optionsOrModifiedOption === "object" ? { ToData: optionsOrModifiedOption.ToData } : {}),
        };
        // } else {
        //     // if (options !== undefined) throw new TypeError(`Artefact.toData(): ArtefactToDataOptions should be the first and only parameter, or the second parameter preceeded by an Artefact instance`);
        //     options = { ...ArtefactToDataOptions.default, ...originalOrOptions, ToData: ArtefactToDataOption.Diff, };
        // }
        // return filterObject(this, ([K, V]) => {
        // const d = Object.getOwnPropertyDescriptor(this, K);
        // console.debug(`K = ${K as string}, d = ${nodeUtil.inspect(d)}`);
        const descriptors = Object.getOwnPropertyDescriptors(this);
        const values = /* filterObject( */mapObject(
            descriptors as Record<string | number, PropertyDescriptor>,
            ([K, V]) => K !== "_id" && K !== "_ts" && K !== "_E" && V.value || (V.get && V.set),
            ([K, V]) => ([K, V.value ?? V.get?.()]));//, ([K, V]) => V);
        // console.debug(`#modifiedPaths=${nodeUtil.inspect(this._modifiedPaths.values())}`);  //descripttors = ${nodeUtil.inspect(descriptors, { getters: true})}\n
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
            byId: <A extends Artefact>(_: A) => ({ "_id": _._id }) as Filter<A>,
        });

    static async* stream<I, A extends Artefact>(this: Constructor<A>, source: AsyncIterable<I>, transform?: (...args: [I]) => A) {
        console.debug(`stream<A=${this.name}>`);
        for await (const item of source) {
            yield transform?.(...[item]) ?? new this(item, true);
        }
    }
}

export declare namespace Artefact {
    export type WithId<A extends Artefact> = Omit<A, "_id"> & { _id: string; };
};


let _enableTimestamps = true;
const targets = new WeakMap();

export type ChangeNotifyCallback = (path: string, oldValue: any, newValue: any, isModified: boolean) => void;

export const ChangeTrackingProxy = <A extends Artefact>(
    target: { [K: string]: any; },
    notifyCallback: ChangeNotifyCallback,
    prefix = "",
    rootTarget?: { [K: string]: any; }
): {} => {
    if (!rootTarget) { //Artefact.isArtefact(_)) {
        rootTarget ??= target;
    }
    console.debug(`ArtefactProxy(): target=${nodeUtil.inspect(target)} prefix=${prefix}, rootTarget===target=${rootTarget===target} targets.has(target)=${targets.has(target)}`);
        return targets.has(target) ? targets.get(target) : targets.set(target, new Proxy(target as {}, {
        set(target: { [K: string]: any; }/* A | Choose<A, DeepProps<A>> */, K: string, newValue: any, receiver: A) {
            console.debug(`ArtefactProxy().set: target=${nodeUtil.inspect(target)} K=${K}, rootTarget===target=${rootTarget===target}`);
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
            throw new Error(`Should not reach here! ${__filename}: ArtefactProxy:195`);
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
    byId: ArtefactStaticQueryFn<A>;
};
export type ArtefactInstanceQueries<A extends Artefact, Q extends ArtefactStaticExtensionQueries<A>> = {
    [K in keyof Q]: ArtefactInstanceQueryFn<A>;
} & {
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
