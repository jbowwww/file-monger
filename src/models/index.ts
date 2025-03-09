import { Filter } from "mongodb";
import * as nodeUtil from 'node:util';
import { get } from "../prop-path";

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

export type ArtefactToDataOptions = {

};

export abstract class Artefact {
    declare prototype: Artefact & { constructor: typeof Artefact; };
    static isArtefact = (o: any): o is Artefact => typeof o === "object" && o.prototype === Artefact.prototype;

    _id?: string;
    _E?: Array<unknown>;

    constructor(data?: Partial<Artefact>) {
        this._id = data?._id;
        this._E = data?._E;
    }

    toData(options?: ArtefactToDataOptions) {
        return filterObject(this, ([K, V]) => {
            const d = Object.getOwnPropertyDescriptor(this, K);
            return (!!d?.value || (d?.get && d?.set && !!d?.get())) ?? false;
        });
    }

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
        for await (const item of source) {
            yield transform?.(...[item]) ?? new this(...[item]);
        }
    }
}

export declare namespace Artefact {
    export type WithId<A extends Artefact> = Omit<A, "_id"> & { _id: string; };
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
