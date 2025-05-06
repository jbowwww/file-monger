import { Filter, IndexSpecification, CreateIndexesOptions } from "mongodb";
import * as nodePath from "node:path";

import debug from "debug";
import z from "zod";
const log = debug(nodePath.basename(module.filename));
const logProxy = log.extend("Proxy");

export type Constructor<T = any> = { name: string; new(...args: any[]): T; /* prototype: T; */ };
export const isConstructor = (v: any): v is Constructor<any> => 
    v && typeof v === "function" &&
    v.prototype && typeof v.prototype === "object" &&
    typeof v.name === "string";

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

export const isAspect = <A extends Aspect = Aspect>(value: any): value is Aspect => value !== null && "_T" in value;// value instanceof Aspect;

export type AspectStaticQuery<A extends Aspect> = (this: Constructor<A>, _: A) => Filter<A>;
export type AspectStaticQueries<A extends Aspect, Q extends AspectStaticExtensionQueries<A> = AspectStaticExtensionQueries<A>> = {
    byUnique: AspectStaticQuery<A>;
} & Q;
export type AspectStaticExtensionQueries<A extends Aspect> = {
    [K: string]: AspectStaticQuery<A>;
};

export type AspectInstanceQuery<A extends Aspect> = () => Filter<A>;
export type AspectInstanceQueries<A extends Aspect, Q extends AspectInstanceExtensionQueries<A> = AspectInstanceExtensionQueries<A>> = {
    byUnique: AspectInstanceQuery<A>;
} & Q;
export type AspectInstanceExtensionQueries<A extends Aspect> = {
    [K: string]: AspectInstanceQuery<A>;
};

export type AspectParameters<A extends Aspect> = Omit<A, "_T" | "Query">;

export type AspectType<A extends Aspect = Aspect> = string | Constructor<A>;

// function makeUniqueQueryFromIndex(uniqueIndex: IndexSpecification): Filter<Aspect> {
//     let names: string[] = [];
//     let directions: IndexDirection[] = [];
//     if (Array.isArray(uniqueIndex)) {
//         if (uniqueIndex.length > 0) {
//             if (Array.isArray(uniqueIndex[0])) {
//                 if (typeof uniqueIndex[0][0] === "string") {
//                     names.push(...(uniqueIndex[0] as string[]).map(index => index[0]));
//                     directions.push(uniqueIndex[0][1]);
//                 }
//                 uniqueIndex = uniqueIndex as any as [string, IndexDirection][];
//                 if (Array.isArray(uniqueIndex)) {
//                     names.push(...uniqueIndex.map((index: [string, IndexDirection]) => index[0]));
//                 }
//             } else if (typeof uniqueIndex[0][0] === "string") {
//                 names.push(uniqueIndex[0][0]);
//                 directions.push(uniqueIndex[0][1]);
//             }
//         }
//     }
// }

/* export const AspectTypeDef = z.object({
    create/* <T extends ZodTypeAny> * /: z.function().args(z.tuple([z.any()])).rest(), z.type(/* T *//* ReturnType<typeofAspectType */ /* > * /)})
    //  */

export const AspectType = z.object({
    _T: z.string().default("Aspect").readonly(),
});

export type Aspect = z.infer<typeof AspectType> & {
    constructor: Constructor<Aspect>;
}

// AspectType.parse()
/* export abstract class Aspect {
    get _T() { return this.constructor.name; }
    constructor() {}
    
    static isAspect = isAspect;
    static async create<A extends Aspect>(this: Constructor<Aspect>, ...args: any) {
        return new this(...args);
    }
} */

/* export abstract class UniqueAspect extends Aspect {
    abstract Query(): AspectInstanceQueries<Aspect>;

    private static _uniqueIndex: IndexSpecification = {};
    public static get uniqueIndex(): IndexSpecification { return this._uniqueIndex; }
    public static set uniqueIndex(v: IndexSpecification) { this._uniqueIndex = v; }
    
    private static _options: CreateIndexesOptions = {};
    public static get options() { return { ...this._options, unique: true, }; }

    public static set options(v) { this._options = v; }    
} */
