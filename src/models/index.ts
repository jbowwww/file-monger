import { Filter } from "mongodb";
import { Query } from '../db';
import * as nodeUtil from 'node:util';

export type KeyValuePair<K extends PropertyKey = PropertyKey, V = unknown> = [K: K, V: V];
export type FilterFn<K extends PropertyKey = PropertyKey, V = unknown> = (kv: KeyValuePair<K, V>) => boolean;
export type MapFn<K extends PropertyKey = PropertyKey, V = unknown, VOut = unknown> = (kv: KeyValuePair<K, V>) => KeyValuePair<K, VOut>;
export function mapObject<K extends PropertyKey = PropertyKey, V = unknown>(
    o: Record<K, V>,
    map: MapFn<K, V>,
): Record<PropertyKey, unknown>;
export function mapObject<K extends PropertyKey = PropertyKey, V = unknown>(
    o: Record<K, V>,
    filter: FilterFn<K, V> | MapFn<K, V>,
    map: MapFn<K, V>,
): Record<PropertyKey, unknown>;
export function mapObject<K extends PropertyKey = PropertyKey, V = unknown>(
    o: Record<K, V>,
    filterOrMap: FilterFn<K, V> | MapFn<K, V>,
    map?: MapFn<K, V>,
): Record<PropertyKey, unknown> {
    return Object.fromEntries<any>(
        (Object.entries(o) as KeyValuePair<K, V>[])
            .filter(map ? filterOrMap : () => true)
            .map<any>(map ?? ((v) => v)));
}
export const filterObject = <K extends PropertyKey = PropertyKey, V = unknown>(
    o: Record<K, V>,
    filter: FilterFn<K, V>,
) =>
    Object.fromEntries<any>(
        (Object.entries(o) as KeyValuePair<K, V>[])
            .filter(filter));

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Constructor<T> = { new(...args: any[]): T; prototype: T; };
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
// export const isConstructor(ctor: any): ctor is Constructor => (Function.isPrototypeOf(ctor)))

export type Id<T> = { [K in keyof T]: T[K] };
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type Aspect<_T extends string | Symbol, T extends {} = {}> = { _T: _T } & T;
export const isAspect = <A extends Aspect<any> = Aspect<any>>(aspect: any): aspect is A => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";
export type AspectFn<A extends Aspect<any> = Aspect<any>> = (...args: any[]) => A;
export type Timestamped<T> = { _ts: Date; } & T;

export abstract class Artefact {
    _id?: string;
    _E?: Array<unknown>;
    static Query: ArtefactStaticQueries<Artefact> = {
        byId: <A extends Artefact>(_: Artefact) => ({ "_id": _._id }) as Filter<A>,
    }
    Query: ArtefactInstanceQueries<Artefact, {}> = mapObject(Artefact.Query, ([K, V]) => ([K, V(this)])) as ArtefactInstanceQueries<Artefact, {}>;

    static async* stream<I, A extends Artefact>(this: Constructor<A>, source: AsyncIterable<I>, transform?: (...args: [I]) => A) {
        for await (const item of source) {
            yield transform?.(...[item]) ?? new this(...[item]);
        }
    }
}
export declare namespace Artefact {
    export type WithId<A extends Artefact/*  = Artefact */> = Omit<A, "_id"> & { _id: string; };
};

export type QueryableArtefact<
    A extends Artefact/*  = Artefact */,
    Q extends ArtefactStaticExtensionQueries<A> = /*{} */  ArtefactStaticExtensionQueries<A>
> = A & {
    Query: ArtefactInstanceQueries<A, Q>;
};
// export namespace Artefact {
// }

export type ArtefactFn<
    A extends Artefact/*  = Artefact */,
    C extends any[]/*  = [] */,
> = (...args: C) => A;

export type ArtefactStaticQueryFn<A extends Artefact /* = Artefact */> = (_: A) => Filter<A>;
export type ArtefactInstanceQueryFn<A extends Artefact/*  = Artefact */> = () => Filter<A>;
export type ArtefactStaticExtensionQueries<A extends Artefact/*  = Artefact */> = {
    [K: string]: ArtefactStaticQueryFn<A>;
};
export type ArtefactInstanceExtensionQueries<A extends Artefact /* = Artefact */> = {
    [K: string]: ArtefactInstanceQueryFn<A>;
};
export type ArtefactStaticQueries<A extends Artefact = Artefact, Q extends ArtefactStaticExtensionQueries<A> = {} /*  ArtefactStaticExtensionQueries<A> */> = Q & {
    byId: ArtefactStaticQueryFn<A>;
};
export type ArtefactInstanceQueries<A extends Artefact /* = Artefact */, Q extends ArtefactStaticExtensionQueries<A>/*  = ArtefactStaticExtensionQueries<A> */> = {
    [K in keyof Q]: ArtefactInstanceQueryFn<A>;
} & {
    byId: ArtefactInstanceQueryFn<A>;
};
// export type ArtefactQueriesInstance<A extends Artefact = Artefact, Q extends ArtefactExtensionQueries<A> = {}> = Q & {
//     byId: ArtefactInstanceQueryFn<A>;
// };
export type ArtefactStaticMethods<A extends Artefact /* = Artefact */, Q extends ArtefactStaticExtensionQueries<A>/*  = ArtefactStaticExtensionQueries<A> */> = {
    stream<I>(source: AsyncIterable<I>): AsyncGenerator<QueryableArtefact<A, Q>>;
    Query: ArtefactStaticQueries<A, Q>;
};

export type QueryableArtefactFn<
    A extends Artefact,
    C extends any[],
    Q extends ArtefactStaticExtensionQueries<A>,//ArtefactStaticExtensionQueries<A>,
> = {
    (...args: C): QueryableArtefact<A, Q>;
} & ArtefactStaticMethods<A, Q>;

// export const Artefact = Object.assign(<
//     A extends Artefact/*  = Artefact */,
//     C extends any[]/*  = [] */,
//     S extends { [K: string]: (...args: any[]) => any; },
//     Q extends ArtefactStaticExtensionQueries<A>/*  = {} */,//ArtefactStaticExtensionQueries<A>,
// >(
//     artefactFn: ArtefactFn<A, C>,
//     statics: S,
//     queries: ArtefactStaticExtensionQueries<A>/* = {} , "byId"> */// ArtefactStaticExtensionQueries<A> //Q
// ): QueryableArtefactFn<A, C, ArtefactStaticExtensionQueries<A>> => {
//     const artefactStaticQueries: ArtefactStaticExtensionQueries<A> = {
//         // byId: (_: A) => ({ "_id": _._id }) as Filter<A>,
//         ...Artefact.Query as ArtefactStaticQueries<A>,
//         ...queries,
//     };//s as ArtefactStaticQueries<A, Q>;
//     const artefactInstanceQueries = (_: QueryableArtefact<A, ArtefactStaticExtensionQueries<A>>) => mapObject(artefactStaticQueries, ([K, V]) => ([K, () => V(_)])) as ArtefactInstanceQueries<A, ArtefactStaticExtensionQueries<A>>;
    
//     const artefactFnWrapper = Object.assign(
//         (...args: C) => {
//             const props = mapObject<string, unknown>(
//                 artefactFn(...args),
//                 ([K, V]) => ([K, { enumerable: true, writable: true, configurable: true, value: V }])
//             ) as PropertyDescriptorMap;
//             const artefact = Object.create({
//                 get Query() { console.debug(`create: this=${nodeUtil.inspect(this)}`); return artefactInstanceQueries(this as QueryableArtefact<A, ArtefactStaticExtensionQueries<A>>); }
//             }, props);
//             console.debug(`artefactFn: artefact=${nodeUtil.inspect(artefact)} props=${nodeUtil.inspect(props)}`);
//             return artefact as QueryableArtefact<A, ArtefactStaticExtensionQueries<A>>;
//         },
//         statics,
//         {
//             async* stream<I>(this: QueryableArtefactFn<A, C, ArtefactStaticExtensionQueries<A>>, source: AsyncIterable<I>, transform?: (...args: [I]) => QueryableArtefact<A, ArtefactStaticExtensionQueries<A>>) {
//                 for await (const item of source) {
//                     yield (transform ?? artefactFn)(...[item] as C);
//                 }
//             },
//             Query: { ...Artefact.Query, ...queries, } as ArtefactStaticQueries<A, ArtefactStaticExtensionQueries<A>>,
//         });
//     Object.defineProperty(artefactFnWrapper, "name", { configurable: true, value: artefactFn.name });
//     return artefactFnWrapper as QueryableArtefactFn<A, C, ArtefactStaticExtensionQueries<A>>;
// }, {
//     async* stream<I>(this: QueryableArtefactFn<Artefact, [], {}>, source: AsyncIterable<I>, transform?: (...args: [I]) => Artefact) {
//         for await (const item of source) {
//             yield (transform ?? this)(...[item]);
//         }
//     },
//     get Query() {
//         return ({
//             byId: <A extends Artefact>(_: Artefact) => ({ "_id": _._id }) as Filter<A>,
//         }) as ArtefactStaticQueries<Artefact, {}>;
//     }
// });
