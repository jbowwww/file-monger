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

export type AspectData<_T extends AspectTypeName = AspectTypeName, T = any> = { _T: _T; } & T;
export type UntypedAspect<A extends AspectData = AspectData> = A extends AspectData<AspectTypeName, infer T> ? T : never;
export interface AspectFn<_T extends AspectTypeName = AspectTypeName, T = any, A extends AnyParameters = AnyParameters> extends Function { (...args: A): T; name: string; _T: string | undefined; };
export interface AspectClass<_T extends AspectTypeName = AspectTypeName, T = any, A extends AnyParameters = AnyParameters> extends Class<T, A> { name?: _T; _T?: _T; }
export type AspectTypeName<T extends AspectTypeName | void | { _T: string; } | { name: string; } = void> =
    T extends void ? string : T extends string ? T : T extends { name: string; } ? T["name"] : T extends { _T: string; } ? T["_T"] : never;
export type AspectType<
    T extends AspectTypeName | { _T: AspectTypeName; } | { name: AspectTypeName; } = any,
    _T extends AspectTypeName = AspectTypeName<T>,
    A extends AnyParameters = AnyParameters
> = AspectFn<_T, T, A> | AspectClass<_T, T, A>;
export type Aspect<
    T extends AspectTypeName | { _T: AspectTypeName; } | { name: AspectTypeName; } = any,
    _T extends AspectTypeName = AspectTypeName<T>
> = AspectData<_T, any> | InstanceType<AspectClass<_T, T>> | ReturnType<AspectFn<_T, T>>;

// this returns a function that returns a "new" (may just assign {_T: "xxx" } to parameter object, depends on implementation of aspect function passed, which gets wrapped)
export const makeAspectType = <_T extends string, T extends Aspect, A extends AnyParameters = AnyParameters>(TOrAspectType: _T | AspectType<_T>, data: any) =>
    (...inputs: A) => Object.defineProperty(data, "_T", { value: typeof TOrAspectType === "string" ? TOrAspectType : "_T" in TOrAspectType ? TOrAspectType._T : TOrAspectType.name });
export const isAspect = <A extends Aspect = Aspect>(aspect: any, aspectType?: Aspect): aspect is A =>
    !!aspect && !!aspectType && typeof aspect === "object" && typeof aspect._T === "string";

export type Timestamped<T> = { _ts: Date; } & T;

export type Artefact<T = {}> = T & { _id?: string; };
