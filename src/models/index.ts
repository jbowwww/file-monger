import * as nodePath from "node:path";
import { isDate } from "node:util/types";

import { Filter, IndexSpecification, CreateIndexesOptions, Document } from "mongodb";

import { Artefact } from "./artefact";
import { Progress } from "../progress";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export const isBoolean = (v: any): v is boolean => typeof v === "boolean";
export const isNumber = (v: any): v is number => typeof v === "number";
export const isString = (v: any): v is string => typeof v === "string";
export const isFalseOrEmptyString = (v: string): boolean => v === undefined || v === null || v.trim() === "";
export const hasPrototype = (prototype: object, value: Constructor<any>): boolean =>
    value && (value === prototype || (prototype && hasPrototype(prototype, value.prototype)));
export const isObject = (o: any): o is Object => o !== null && typeof o === "object";
export const isNonDateObject = (o: any): o is Object => typeof o === "object" && !isDate(o) && !(o instanceof Date);

export type AnyParameters<T = any> = [] | [T] | T[];  // Use for ...rest parameters on functions, this type better handles both 0, 1, or more arguments, while using any[] sometimes fails with one parameter
export type NonEmptyArray<T = any> = [T] | T[];
export type Optional<T extends {}, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P]; }
export type PartiallyRequired<T extends {}, R extends keyof T> = Required<Pick<T, R>> & Partial<Omit<T, R>>;

export type Function<A extends AnyParameters = any[], R extends any = any> = (...args: A) => R;

export const isFunction = (fn: any): fn is Function => typeof fn === "function";
export const isPlainFunction = (fn: any): fn is Function => isFunction(fn) && !isAsyncGeneratorFunction(fn);
export const getFunctionName = (fn: Function, ...fallbackNames: string[]) => (fn.name?.trim() ?? "").length > 0 ? fn.name : fallbackNames.length > 0 ? fallbackNames.reduce((setName, nextName) => setName?.trim() === "" ? nextName : setName) : "(anon)";
export const makeFunction = <P extends AnyParameters, R extends any>(name: string, fn: Function<P, R>) => Object.defineProperty(fn, "name", { value: name });

export type AsyncGeneratorFunction<I = any, O = any, R = any, N = any, L extends number = 0 | 1> =
    (...args:
        L extends 1 ? [AsyncIterable<I>/* , ...extra: AnyParameters */] :
        L extends 0 ? [/* ...extra: AnyParameters */] : [AsyncIterable<I>/* , ...extra: AnyParameters */]) => AsyncGenerator<O, R, N>;

export const isIterable = <T extends any = any, R = any, N = any>(value: any): value is Iterable<T, R, N> => value && Symbol.iterator in value && typeof value[Symbol.iterator] === "function";
export const isAsyncIterable = <T extends any = any, R = any, N = any>(value: any): value is AsyncIterable<T, R, N> => value && Symbol.asyncIterator in value && typeof value[Symbol.asyncIterator] === "function";
export const isAsyncGenerator = <T = unknown, R = any, N = any>(value: any): value is AsyncGenerator<T, R, N> => value && isAsyncIterable(value) && "next" in value && typeof value.next === "function";
export const isAsyncGeneratorFunction = <I = any, O = any, R = any, N = any, L extends 0 | 1 = 0 | 1>(value: any, argumentsLength?: L): value is AsyncGeneratorFunction<I, O, R, N, L> =>
        value && typeof value === "function" && isAsyncGenerator<O, R, N>(value.prototype) && (!argumentsLength || value.length === argumentsLength);

export type TypeGuard<T> = (value: any) => value is T;

export type AbstractConstructor<T = any> = abstract new (...args: any[]) => T;
export type Constructor<T = any> = { name: string; new(...args: any[]): T; /* prototype: T; */ };
export const isConstructor = <T = {}>(value: unknown, ctor?: AbstractConstructor<T>): value is Constructor<T> =>
    value && typeof value === "function" && value.prototype && (
        !ctor || (typeof ctor.name === "string" &&
        typeof ctor.prototype === "object" && hasPrototype(ctor.prototype, value as Constructor<T>)));

export type AsyncFunction<A extends AnyParameters = [], R extends any = void> = (...args: A) => Promise<R>;
export type MaybeAsyncFunction<A extends AnyParameters = [], R extends any = void> = (...args: A) => R | Promise<R>;

export type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never; }[keyof T];
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;
export type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? never : K; }[keyof T];
export type DataProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;

export type KeyValuePair<K extends PropertyKey = PropertyKey, V = unknown> = [K: K, V: V];
export type FilterFn<T extends {}> = (kv: KeyValuePair<keyof T, T[keyof T]>) => boolean;
export type MapFn<T extends {}, TOut extends {} = T> = (kv: KeyValuePair<keyof T, T[keyof T]>/* , obj: {} */) => KeyValuePair<keyof TOut, TOut[keyof TOut]>;
function _mapObject<T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, map: MapFn<T, TOut>): TOut;
function _mapObject<T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, filter: FilterFn<T> | MapFn<T, TOut>, map?: MapFn<T, TOut>): TOut;
function _mapObject<T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, filterOrMap: FilterFn<T> | MapFn<T, TOut>, map?: MapFn<T, TOut>): TOut {
    return Object.fromEntries((Object.entries(o) as KeyValuePair<keyof T, T[keyof T]>[])
        .filter(map ? filterOrMap : () => true)
        .map(map ?? ((kv: KeyValuePair<keyof T, T[keyof T]>) => kv as KeyValuePair<PropertyKey, any>))) as TOut;
}
_mapObject.recursive = function <T extends { [K: string]: any; }, TOut extends { [K: string]: any; }>(o: T, filterOrMap: FilterFn<T[keyof T]> | MapFn<T[keyof T], TOut>, map?: MapFn<T[keyof T], TOut>): TOut {
        const filter = map ? filterOrMap as FilterFn<any> : () => true;
        const recursiveMap: MapFn<any, any> = ([K, V]: [any, any]) => (map ? map : filterOrMap as MapFn<any, TOut>)([K, _mapObject.recursive(V, filter, recursiveMap)]);
        return _mapObject<any, TOut>(o, filter, recursiveMap)
    };
export const mapObject: typeof _mapObject & { recursive: typeof _mapObject.recursive; } = Object.assign(_mapObject, { recursive: _mapObject.recursive });
export const filterObject = <T extends {}>(o: T, filter: FilterFn<T>): Partial<T> => Object.fromEntries((Object.entries(o) as KeyValuePair<keyof T, T[keyof T]>[]).filter(filter)) as Partial<T>;

export const partialObject = <T extends {}>(o: T, ...keys: (keyof T)[]): Partial<T> => filterObject(o, ([K, V]) => !!keys.find(k => k === K));
export const pickFromObject = partialObject;

export const omitFromObject = <T extends {}>(o: T, ...keys: (keyof T)[]): Partial<T> => filterObject(o, ([K, V]) => !keys.find(k => k === K));

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

// could be a class ? but then would always have to new () when passing options :/
export type OptionsDefaultContainer<T extends {}> = {
    default: T;
    mergeDefaults: (/* this: OptionsDefaultContainer<T>, */ defaultOptions?: Partial<T>) => T;
    applyDefaults: (/* this: OptionsDefaultContainer<T>, */ options: Partial<T>) => void;
};
export function mergeOptions<T extends {}>(this: /* defaultOptionsContainer: */ OptionsDefaultContainer<T>, options?: Partial<T>): T { return ({ ...this.default, ...options, }); }
export function applyDefaultOptions<T extends {}>(this: OptionsDefaultContainer<T>, options: Partial<T>): void { for (const name in this.default) { if (!(name in options)) { options[name as keyof T] = this.default[name as keyof T]; } } }
export function makeDefaultOptions<T extends {}>(defaultOptions: T): OptionsDefaultContainer<T> { return ({ default: defaultOptions, mergeDefaults: mergeOptions, applyDefaults: applyDefaultOptions, }); }

export type ProgressOption = { progress?: Partial<Progress>; };

export type ThrottleOptions = {
    expiryAgeMs: number;
};
export const ThrottleOptions = makeDefaultOptions<ThrottleOptions>({
    expiryAgeMs: 0,     // never expires, so always returns cached value after initial call, aka memoize()
});
export const throttle = <R extends any>(
    fnOrOptions: AsyncFunction<[], R> | ThrottleOptions,
    optionsOrFn?: AsyncFunction<[], R> | ThrottleOptions,
) => {
    const [fn, options] = getUnorderedParameterAndOption<AsyncFunction<[], R>, ThrottleOptions>(
        fnOrOptions, isFunction as TypeGuard<AsyncFunction<[], R>>,
        optionsOrFn, isObject as TypeGuard<ThrottleOptions>);
    const name = getFunctionName(fn);
    let isCached: boolean = false;
    let pendingPr: Promise<R>;
    let cached: R | null = null;
    return (): Promise<R> => {
        if (!isCached) {
            isCached = true;
            cached = null;
            pendingPr = fn().then(r => {
                log("throttle(): Function '%s' returned value %O", name ?? "(anon)", r);
                return cached = r;
            });
            setTimeout(() => {
                isCached = false;
            }, options.expiryAgeMs);
            log("throttle(): Function '%s' called", name ?? "(anon)");
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

export type AspectStaticQuery<A extends Aspect = Aspect> = (...args: [A] | [unknown] | unknown[]) => Filter<Document>;
export type AspectStaticQueries<A extends Aspect = Aspect, Q extends AspectStaticExtensionQueries<A> = AspectStaticExtensionQueries<A>> = {
    // byUnique: AspectStaticQuery<Document>;
} & Q;
export type UniqueAspectStaticQueries<A extends UniqueAspect = UniqueAspect, Q extends AspectStaticExtensionQueries<A> = AspectStaticExtensionQueries<A>> = AspectStaticQueries<A, Q & {
    byUnique: AspectStaticQuery<A>;
}>;
export type AspectStaticExtensionQueries<A extends Aspect = Aspect> = {
    [K: string]: AspectStaticQuery<A>;
};

export type AspectInstanceQuery<A extends Aspect = Aspect> = () => Filter<Document>;
export type AspectInstanceQueries<A extends Aspect = Aspect> = { [K: string]: AspectInstanceQuery; };
export type UniqueAspectInstanceQueries<A extends UniqueAspect = UniqueAspect> = AspectInstanceQueries<A> & {
    byUnique: AspectInstanceQuery<A>;
};
export type AspectInstanceExtensionQueries<A extends Aspect = Aspect> = {
    [K: string]: AspectInstanceQuery<A>;
};

export type AspectParameters<A extends Aspect> = DataProperties<Omit<A, "_T" | "Query" | "uniqueQuery" | "isAspect" | "ops">>;

export type AspectClass<A extends Aspect = Aspect> = AbstractConstructor<A>/*  & { name: string; } */ & { _T: string; };
export type AspectClassOrName<A extends Aspect = Aspect> = AspectClass<A> | string;

export type NamespacedAspect<T> = { [K: string]: T; };

export function isAspect<A extends Aspect>(this: Aspect | AbstractConstructor<A> | undefined, value: any): value is A {
    return (this && typeof this === "function" && "_T" in this && typeof this._T === "string" &&
        value && typeof value === "object" && "_T" in value && value._T === this._T) ||
        (!this && value && typeof value === "object" && "_T" in value && typeof value._T === "string");//
    // && //typeof this?._T === "string" : (/* "_T" in value */typeof this === "string" && (this ? (
        // typeof this === "function" ?
        //     value._T === this.name :
        //     value._T === this;//) :
        // typeof value._T === "string") : );
};
// might still need to handle case where this===null && value is AspectType<A> (ths might even be the most common usage)

export const isAspectType = <A extends Aspect>(/* this: AspectType<A> | string | void, */ value: any): value is AspectClass<A> =>
    value && (typeof value === "function" && "_T" in value && typeof value._T === "string");
export const isAspectTypeOrName = <A extends Aspect>(/* this: AspectType<A> | string | void, */ value: any): value is AspectClassOrName<A> =>
    value && (typeof value === "string" || (typeof value === "function" && "_T" in value && typeof value._T === "string"));
        // _T(value ? (
    //     typeof this === "function" ?
    //         value._T === this.name :
    //         value._T === this) :
    //     typeof value._T === "string");
// };

export abstract class Aspect {

    static readonly _T = this.constructor.name;

    static is<A extends Aspect>(this: AbstractConstructor<A>, value: any): value is A { return isAspect.call(this, value); }
    static async create(this: typeof Aspect, ...args: any): Promise<Aspect> {
        // return new this(...args);
        throw new TypeError();
    }

    isAspect: true = true;
    readonly _T = this.constructor.name;
    constructor(...args: AnyParameters) { }
    getUpdates<A extends Aspect>(previous?: A) {

    }
    // flatten/* <A extends Aspect> */(/* this: A, *//*  obj?: A | Filter<Document> | UpdateFilter<Document> | Document, */ prefix = `${this._T}`): Record<string, any> {
    //     const flattened: Record<string, any> = {};
    //     for (const K in get(this, prefix)) {
    //         const shouldPrepend = typeof K === "string" ? (K as string).at(0) !== "$" : true;
    //         return ([
    //             shouldPrepend ? K : this._T + "." + K,
    //             Object.getOwnPropertyNames(V).length > 0 && typeof isObject(V) ? this.flatten(V, ) : V]) as KeyValuePair<any, any>;
    //     });
    // };
    get Query(): AspectInstanceQueries<Aspect> { return {}; };
    asArtefact<A extends Artefact>() {
        return ({ [this._T]: this }) as unknown as A;
    }
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
