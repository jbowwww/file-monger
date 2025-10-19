import * as nodeUtil from "node:util";
import { get } from "../prop-path";
import { ReturnDocument } from "mongodb";

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Constructor<T> = { new(...args: any[]): T; prototype: T; };
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
export type AnyParameters<T = any> = [] | [T] | T[];
export interface Class<T, A extends AnyParameters = AnyParameters, N extends string = string> {
    new(...args: A): T;
    name: string;
}
// export const isConstructor(ctor: any): ctor is Constructor => (Function.isPrototypeOf(ctor)))

export type Id<T> = { [K in keyof T]: T[K] };
export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;

export type AspectData<_T extends string = string, T extends {} = {}> = { _T: _T; } & T;
export interface AspectFn<_T extends string = string, T extends {} = {}> extends Function {
    name: string;
    _T: string | undefined;
}
// export type AspectClass<_T extends string, T extends {}> = { _T: _T; } & T;
export interface AspectClass<_T extends string = string, T extends {} = {}> extends Class<T> {
    name: _T;
    _T: _T;
}
export type Aspect<_T extends string = string, T extends {} = {}> = AspectData<_T, T> | AspectClass<_T, T> | AspectFn<_T, T>;
export const isAspect = <A extends Aspect<any> = Aspect<any>>(aspect: any): aspect is A => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";

export type Timestamped<T> = { _ts: Date; } & T;

export type Artefact<T = {}> = T & { _id?: string; };
