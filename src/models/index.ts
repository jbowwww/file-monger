import { Filter, IndexSpecification, CreateIndexesOptions, Document, UpdateFilter, BulkWriteOptions } from "mongodb";
import * as nodePath from "node:path";

import debug from "debug";
import { Artefact } from "./artefact";
import { flattenPropertyNames, Query } from "../db";
const log = debug(nodePath.basename(module.filename));
const logProxy = log.extend("Proxy");

export const hasPrototype = (prototype: object, value: Constructor<any>): boolean =>
    value && (value === prototype || (prototype && hasPrototype(prototype, value.prototype)));
export type Constructor<T = any> = { name: string; new(...args: any[]): T; /* prototype: T; */ };
export const isConstructor = <T = {}>(value: unknown, ctor?: AbstractConstructor<T>): value is Constructor<T> =>
    value && typeof value === "function" && value.prototype && (
        !ctor || (typeof ctor.name === "string" &&
        typeof ctor.prototype === "object" && hasPrototype(ctor.prototype, value as Constructor<T>)));

export type AbstractConstructor<T = any> = abstract new (...args: any[]) => T;

export const isObject = (o: any): o is Object => o !== null && typeof o === "object";
export const isFunction = (fn: any): fn is Function => typeof fn === "function";

export type AsyncFunction<A extends any[] = [], TReturn extends any = void> = (...args: A) => Promise<TReturn>;

export type FunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

export type NonFunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
export type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;
   
export type TypeGuard<T> = (value: any) => value is T;

export type Optional<T extends {}, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P]; }
export type PartiallyRequired<T extends {}, R extends keyof T> = Required<Pick<T, R>> & Partial<Omit<T, R>>;

export type KeyValuePair<K extends PropertyKey = PropertyKey, V = unknown> = [K: K, V: V];
export type FilterFn<T extends {}> = (kv: KeyValuePair<keyof T, T[keyof T]>) => boolean;
export type MapFn<T extends {}, TOut extends {}> = (kv: KeyValuePair<keyof T, T[keyof T]>/* , obj: {} */) => KeyValuePair<keyof TOut, TOut[keyof TOut]>;
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
export function mapOp(op: { filter: Filter<Aspect>, update: UpdateFilter<Aspect>, } /* & BulkWriteOptions */, mapFn: MapFn<any, any>) { return mapObject(op, ([K, V]) => ([K, mapObject(V, mapFn)])); };
export type ValueUnion<T extends {}> = T[keyof T];
export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Choose<
  T extends Record<string | number, any>,
  K extends string | number //   K extends DeepProps<T>
> = K extends `${infer U}.${infer Rest}` ? Choose<T[U], Rest> : T[K];

export type Join<K extends string | number, P extends string | number> = `${K}.${P}`
export type DeepProps<
  T extends Record<string | number, any>,
  K extends Exclude<keyof T, symbol> = Exclude<keyof T, symbol>,
  U extends string | number = ''
> = T[K] extends Record<string | number, unknown> ?
    (U extends '' ? K : U) |
        DeepProps<
            T[K],
            Exclude<keyof T[K], symbol>,
            U extends ''
                ? Join<K, Exclude<keyof T[K], symbol>>
                : U | Join<U, Exclude<keyof T[K], symbol>>
        > : U;

// Use for ...rest parameters on functions, this type better handles both 0, 1, or more arguments, while using any[] sometimes fails with one parameter
export type AnyParameters = [any] | any[];

const getUnorderedParameters = <P1, P2>(
    p1: P1 | P2, typeGuard1: TypeGuard<P1>,
    p2: P2 | P1 | undefined, typeGuard2: TypeGuard<P2>
): [P1, P2] => {
    let r1: P1, r2: P2;
    if (!p2) {
        if (!p1 || !typeGuard1(p1)) {
            throw new TypeError("getUnorderedParameters(): First parameter should be a P1, or a P2 object followed by a P1");
        }
    } else if (typeGuard1(p1)) {
        r1 = p1;
        r2 = p2 as P2;
    } else if (typeGuard2(p1)) {
        if (!typeGuard1(p2)) {
            throw new TypeError("getUnorderedParameters(): First parameter should be a P1, or a P2 object followed by a P1");
        }
        r1 = p2;
        r2 = p1;
    }
    return [r1!, r2!];
};

const getUnorderedParameterAndOption = <P1, P2>(
    p1: P1 | Partial<P2>, typeGuard1: (value: any) => boolean,
    p2: Partial<P2> | P1 | undefined, typeGuard2: (value: any) => boolean,
    defaultOptions?: P2
): [P1, P2] => {
    let [r1, r2] = getUnorderedParameters(p1 as P1 | P2, typeGuard1 as TypeGuard<P1>, p2 as P2 | P1 | undefined, typeGuard2 as TypeGuard<P2>);
    if (defaultOptions) {
        r2 = { ...defaultOptions, ...r2 };
    }
    return [r1, r2];
};

export type OptionsDefaultContainer<T extends {}> = { default: T; };
export const mergeOptions = <T extends {}>(defaultOptionsContainer: OptionsDefaultContainer<T>, options?: T) => ({ ...defaultOptionsContainer.default, ...options });

export type ThrottleOptions = {
    expiryAgeMs: number;
};
export const ThrottleOptions: OptionsDefaultContainer<ThrottleOptions> = {
    default: {
        expiryAgeMs: 0,     // never expires, so always returns cached value after initial call, aka memoize()
    },
};

export const throttle = <R extends any>(
    fnOrOptions: AsyncFunction<[], R> | ThrottleOptions,
    optionsOrFn?: AsyncFunction<[], R> | ThrottleOptions,
) => {
    const [fn, options] = getUnorderedParameterAndOption<AsyncFunction<[], R>, ThrottleOptions>(
        fnOrOptions, isFunction as TypeGuard<AsyncFunction<[], R>>,
        optionsOrFn, isObject as TypeGuard<ThrottleOptions>);
    let isCached: boolean = false;
    let pendingPr: Promise<R>;
    let cached: R | null = null;
    return (): Promise<R> => {
        if (!isCached) {
            isCached = true;
            cached = null;
            pendingPr = fn().then(r => {
                log("throttle(): Function '%s' returned value %O", fn.name ?? "(anon)", r);
                return cached = r;
            });
            setTimeout(() => {
                isCached = false;
            }, options.expiryAgeMs);
            log("throttle(): Function '%s' called", fn.name ?? "(anon)");
        }
        if (cached === null) {
            log("throttle(): Returning newly executing promise...");
            return pendingPr;
        } else {
            log("throttle(): Returned cached=%O", cached);
            return Promise.resolve(cached);
        }
    };
};

export type MemoizeOptions = Omit<ThrottleOptions, "expiryAgeMs">;
export const memoize = <R extends any>(
    fnOrOptions: AsyncFunction<[], R> | MemoizeOptions,
    optionsOrFn?: AsyncFunction<[], R> | MemoizeOptions,
) => throttle(fnOrOptions as AsyncFunction<[], R> | ThrottleOptions, { ...optionsOrFn, expiryAgeMs: 0, });

export type Id<T> = { [K in keyof T]: T[K] };
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type NamespacedAspect<T> = { [K: string]: T; };

export const isAspect = function isAspect<A extends Aspect>(this: AbstractConstructor<A>, value: any): value is A { return value !== null && value instanceof this; };

export type AspectStaticQuery<A extends Aspect = Aspect> = (...args: [A] | [unknown] | unknown[]) => Filter<A>;
export type AspectStaticQueries<A extends Aspect = Aspect, Q extends AspectStaticExtensionQueries<A> = AspectStaticExtensionQueries<A>> = {
    // byUnique: AspectStaticQuery<A>;
} & Q;
export type UniqueAspectStaticQueries<A extends UniqueAspect = UniqueAspect, Q extends AspectStaticExtensionQueries<A> = AspectStaticExtensionQueries<A>> = AspectStaticQueries<A, Q & {
    byUnique: AspectStaticQuery<A>;
}>;
export type AspectStaticExtensionQueries<A extends Aspect = Aspect> = {
    [K: string]: AspectStaticQuery<A>;
};

export type AspectInstanceQuery<A extends Aspect = Aspect> = () => Filter<A>;
export type AspectInstanceQueries<A extends Aspect = Aspect> = { [K: string]: AspectInstanceQuery; };
export type UniqueAspectInstanceQueries<A extends UniqueAspect = UniqueAspect> = AspectInstanceQueries<A> & {
    byUnique: AspectInstanceQuery<A>;
};
export type AspectInstanceExtensionQueries<A extends Aspect = Aspect> = {
    [K: string]: AspectInstanceQuery<A>;
};

export type AspectParameters<A extends Aspect> = NonFunctionProperties<Omit<A, "_T" | "Query" | "uniqueQuery" | "isAspect">>;

export type AspectType<A extends Aspect = Aspect> = string | AbstractConstructor<A>;


export abstract class Aspect {
    isAspect: true = true;
    get _T() { return this.constructor.name; }
    constructor(...args: AnyParameters) {}
    getUpdates<A extends Aspect>(previous?: A) {

    }
    static is = isAspect;
    static async create(this: typeof Aspect, ...args: any): Promise<Aspect> {
        // return new this(...args);
        throw new TypeError();
    }
    namespace(op: { filter: Filter<Aspect>, update: UpdateFilter<Aspect> }) {
        return mapOp(op, ([K, V]: [any, any]) => ([(K.at(0) === "$" ? "" : this._T + ".") + K, /* flattenPropertyNames */(V)/* .update */]));
    };
    abstract get Query(): AspectInstanceQueries<Aspect>;
}

export abstract class UniqueAspect extends Aspect {
    private static _uniqueIndex: IndexSpecification = {};
    public static get uniqueIndex(): IndexSpecification { return this._uniqueIndex; }
    public static set uniqueIndex(v: IndexSpecification) { this._uniqueIndex = v; }
    
    private static _options: CreateIndexesOptions = {};
    public static get options() { return { ...this._options, unique: true, }; }

    public static set options(v) { this._options = v; }

    abstract get Query(): UniqueAspectInstanceQueries;
}
