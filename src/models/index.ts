import { Filter } from "mongodb";
import * as nodePath from "node:path";
import * as nodeUtil from "node:util";
import { isDate, isProxy } from "node:util/types";
import { get } from "../prop-path";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));
const logProxy = log.extend("Proxy");

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

export type DiscriminateUnion<T, V extends Constructor<T>["name"]> = Extract<T, Record<"name", V>>;
export type DiscriminatedModel<T extends /* abstract */ { new (...args: any[]): any; }> = { [V in Constructor<T>["name"]]: DiscriminateUnion<T, V> };

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

export const isObject = (o: any): o is Object => o !== null && typeof o === "object";
export const isFunction = (fn: any): fn is Function => typeof fn === "function";

export type AsyncFunction<A extends any[] = [], TReturn extends any = void> = (...args: A) => Promise<TReturn>;

export type TypeGuard<T> = (value: any) => value is T;

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

export abstract class Aspect {}
export const isAspect = <A extends Aspect = Aspect>(value: any): value is Aspect => value !== null && value instanceof Aspect;
    /* T = A extends Aspect<infer _T> ? _T : never */
// >(aspectTypeOrAspect: any/* AspectFn<A> | string | A */, aspect?: any): aspect is A =>
//     (aspect && typeof aspect === "object" && typeof aspect._T === "string" &&
//         ((isFunction(aspectTypeOrAspect) && aspect._T === aspectTypeOrAspect.name) ||
//         (typeof aspectTypeOrAspect === "string" && aspect._T === aspectTypeOrAspect))) ||
//     (!aspect && !!aspectTypeOrAspect && typeof aspectTypeOrAspect === "object" && typeof aspectTypeOrAspect._T === "string");

export type AspectFn<A extends Aspect = Aspect> = (...args: any[]) => A;
// export type AspectTypeName<A extends Aspect> = A extends Aspect<infer _T, {}> ? _T : never;
// export type AspectData<A extends Aspect<any>> = A extends Aspect<infer _T, infer D> ? (D & { _T: _T }) : never;
