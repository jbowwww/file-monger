import { Filter } from "mongodb";
import { Query } from '../db';

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
// export type Aspect<_T extends string | Symbol, T extends {} = {}> = { _T: _T; } & T;
export const isAspect = <A extends Aspect<any> = Aspect<any>>(aspect: any): aspect is A => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";
export type AspectFn<A extends Aspect<any> = Aspect<any>> = (...args: any[]) => A;
export type Timestamped<T> = { _ts: Date; } & T;

export type Artefact<T extends {} = {}> = T & { _id?: string; _E?: Array<unknown>; };
export type QueryableArtefact<A extends Artefact = Artefact, Q extends ArtefactStaticExtensionQueries<A> = ArtefactStaticExtensionQueries<A>> = A & { Query: ArtefactInstanceQueries<A, Q>; };
export namespace Artefact {
    export type WithId<A extends Artefact = Artefact> = Omit<A, "_id"> & { _id: string; };
};

export type ArtefactFn<
    A extends Artefact = Artefact,
    C extends any[] = [],
> = (...args: C) => A;

export type ArtefactStaticQueryFn<A extends Artefact /* = Artefact */> = (_: A) => Filter<A>;
export type ArtefactInstanceQueryFn<A extends Artefact/*  = Artefact */> = () => Filter<A>;
export type ArtefactStaticExtensionQueries<A extends Artefact/*  = Artefact */> = {
    [K: string]: ArtefactStaticQueryFn<A>;
};
export type ArtefactInstanceExtensionQueries<A extends Artefact /* = Artefact */> = {
    [K: string]: ArtefactInstanceQueryFn<A>;
};
export type ArtefactStaticQueries<A extends Artefact/*  = Artefact */, Q extends ArtefactStaticExtensionQueries<A> = {} /* ArtefactStaticExtensionQueries<A> */> = Q & {
    byId: ArtefactStaticQueryFn<Artefact>;
};
export type ArtefactInstanceQueries<A extends Artefact /* = Artefact */, Q extends ArtefactStaticExtensionQueries<A> = ArtefactStaticExtensionQueries<A>> = {
    [K in keyof Q]: ArtefactInstanceQueryFn<A>;
} & {
    byId: ArtefactInstanceQueryFn<A>;
};
// export type ArtefactQueriesInstance<A extends Artefact = Artefact, Q extends ArtefactExtensionQueries<A> = {}> = Q & {
//     byId: ArtefactInstanceQueryFn<A>;
// };
export type ArtefactStaticMethods<A extends Artefact /* = Artefact */, Q extends ArtefactStaticExtensionQueries<A> = ArtefactStaticExtensionQueries<A>> = {
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

export const Artefact = Object.assign(<
    A extends Artefact/*  = Artefact */,
    C extends any[]/*  = [] */,
    Q extends ArtefactStaticExtensionQueries<A>/*  = {} */,//ArtefactStaticExtensionQueries<A>,
>(
    artefactFn: ArtefactFn<A, C>,
    queries: Q, //ArtefactStaticExtensionQueries<A> = {}/* , "byId"> */// ArtefactStaticExtensionQueries<A> //Q
): QueryableArtefactFn<A, C, Q> & ArtefactStaticMethods<A> => {
    const artefactStaticQueries = {
        // byId: (_: A) => ({ "_id": _._id }) as Filter<A>,
        ...Artefact.Query,
        ...queries,
    };//s as ArtefactStaticQueries<A, Q>;
    const artefactInstanceQueries = (_: QueryableArtefact<A, Q>) => mapObject(artefactStaticQueries, ([K, V]) => ([K, () => V(_)])) as ArtefactInstanceQueries<A, Q>;
    const artefact = Object.assign(
        (...args: C) => Object.assign(artefactFn(...args), {
            get Query() { return artefactInstanceQueries(this as QueryableArtefact<A, Q>); }
        }) /* as QueryableArtefact<A, Q> */,
        {
            async* stream<I>(this: QueryableArtefactFn<A, C, Q>, source: AsyncIterable<I>, transform?: (...args: [I]) => QueryableArtefact<A, Q>) {
                for await (const item of source) {
                    yield (transform ?? artefact)(...[item] as C);
                }
            },
            Query: { ...Artefact.Query, ...queries, } as ArtefactStaticQueries<A, Q>,
        });
    Object.defineProperty(artefact, "name", { configurable: true, value: artefactFn.name });
    return artefact;
}, {
    async* stream<I>(this: QueryableArtefactFn<Artefact, [], {}>, source: AsyncIterable<I>, transform?: (...args: [I]) => Artefact) {
        for await (const item of source) {
            yield (transform ?? this)(...[item]);
        }
    },
    get Query() {
        return ({
            byId: (_: Artefact) => ({ "_id": _._id }) as Filter<Artefact>,
        }) as ArtefactStaticQueries<Artefact>   ;
    }
});
