import * as nodeUtil from "node:util";
import { get } from "../prop-path";
import { ReturnDocument } from "mongodb";

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[K]>, K extends PropertyKey = "_T"> = { [V in T[K]]: DiscriminateUnion<T, K, V> };

export type Constructor<T> = { new(...args: any[]): T; prototype: T; };
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
export type AnyParameters<T = any> = [] | [T] | T[];
export type MaybeAbstractClass<T, A extends AnyParameters = AnyParameters, N extends string = string> = abstract new (...args: A) => T & { name?: string; };
export type Class<T, A extends AnyParameters = AnyParameters, N extends string = string> = new (...args: A) => T & { name?: string; }
// export const isConstructor(ctor: any): ctor is Constructor => (Function.isPrototypeOf(ctor)))

export type Id<T> = { [K in keyof T]: T[K] };

export type Converter<T, K extends string, V> = T extends any ? { [P in keyof Id<Record<K, V> & T>]: Id<Record<K, V> & T>[P] } : never;
//          ^ for what?

export type AspectData<_T extends string = string, T = any> = { _T: _T; } & T;
export interface AspectFn<_T extends string = string, T = any, A extends AnyParameters = AnyParameters> extends Function { (...args: A): T; name: string; _T: string; };
// export type AspectClass<_T extends string, T extends {}> = { _T: _T; } & T;
export interface AspectClass<_T extends string = string, T = any, A extends AnyParameters = AnyParameters> extends Class<T, A> { name?: _T; _T?: _T; }
export type AspectTypeName<
    T extends any | { _T: string; } | { name: string; } = any,
    _T extends string = T extends { name: string; } ? T["name"] : T extends { _T: string; } ? T["_T"] : string
> = _T;
export type AspectType<
    T extends any | { _T: string; } | { name: string; } = any,
    _T extends string = T extends { name: string; } ? T["name"] : T extends { _T: string; } ? T["_T"] : string,
    A extends AnyParameters = AnyParameters
> = AspectClass<_T, T, A>
export type Aspect<
    T extends any | { _T: string; } | { name: string; } = any,
    _T extends string = T extends { name: string; } ? T["name"] : T extends { _T: string; } ? T["_T"] : never
> = AspectData<_T, T> | InstanceType<AspectClass<_T, T>> | ReturnType<AspectFn<_T, T>>;
export const isAspect = <A extends Aspect = Aspect>(aspect: any, aspectType?: Aspect): aspect is A =>
    !!aspect && !!aspectType && typeof aspect === "object" && typeof aspect._T === "string";

export type Timestamped<T> = { _ts: Date; } & T;

export type Artefact<T = {}> = T & { _id?: string; };
