import * as nodeUtil from "node:util";
import { get } from "../prop-path";
import { Filter } from "mongodb";

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Id<T> = {[K in keyof T]: T[K]};
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type Aspect/* <T extends { _T: T["_T"]; } */ = { "_T": PropertyKey; }/* > = T *//*  & { _T: T["_T"]; } */;
export const isAspect = (aspect: any): aspect is Aspect => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";

export type Artefact<T = {}> = T & {
    _id?: string;
};

export const Query = <A extends Artefact>(_: A, path: string): Filter<A> => ({ [path]: get(_, path) }) as Filter<A>;

