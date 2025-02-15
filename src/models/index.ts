import { Filter } from "mongodb";
import { get } from "../prop-path";

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Constructor<T> = { new(...args: any[]): T; prototype: T; };
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
// export const isConstructor(ctor: any): ctor is Constructor => (Function.isPrototypeOf(ctor)))

export type Id<T> = { [K in keyof T]: T[K] };
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type Aspect<_T extends string, T extends {} = {}> = { _T: _T; } & T;
export const isAspect = <A extends Aspect<any> = Aspect<any>>(aspect: any): aspect is A => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";
export type AspectFn<A extends Aspect<any> = Aspect<any>> = (...args: any[]) => A;
export type Timestamped<T> = { _ts: Date; } & T;


export type Artefact<T = {}> = T & { _id?: string; };
// export type WithId<A extends Artefact = Artefact> = Omit<A, "_id"> & { _id: string; };
export type ArtefactQueryFn<A extends Artefact = Artefact> = (this: A) => Filter<A>;
export type ArtefactExtensionQueries<A extends Artefact> = {
    [K: string]: ArtefactQueryFn<A>;
};
export type ArtefactQueries<A extends Artefact = Artefact, Q extends ArtefactExtensionQueries<A> = {}> = {
    byId: ArtefactQueryFn<Artefact.WithId<A>>;
} & Q;
export type ArtefactStaticMethods<A extends Artefact = Artefact, Q extends ArtefactExtensionQueries<A> = {}> = {
    Query: ArtefactQueries<A, Q>;
};
export type ArtefactFn<A extends Artefact = Artefact, TCtorArgs extends any[] = [], Q extends ArtefactExtensionQueries<A> = {}> =
    ((...args: TCtorArgs) => A) &
    ArtefactStaticMethods<A, Q>;

export const Artefact: ArtefactStaticMethods = {
    Query: {
        byId(this: Artefact.WithId<Artefact>) { return ({ _id: { $eq: this._id } }); },
    },
};
export namespace Artefact {
    export type WithId<A extends Artefact = Artefact> = Omit<A, "_id"> & { _id: string; };
};