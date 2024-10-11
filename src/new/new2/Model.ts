import { Filter } from "mongodb";
import pProps from "p-props";

export type ClassConstructor<T = any, TCtorArgs extends Array<any> = Array<any>> = (new (...args: TCtorArgs) => T);
export type AbstractConstructor<T> = {
    name: string;
    prototype: T;
};

export const is = <T, C extends { new(...args: any[]): T; } = { new (...args: any[]): T; }>(value: any, typeCtor: C): value is T => value.constructor == typeCtor;
export type PromiseValue<T extends Promise<any>> = T extends Promise<infer R> ? R : never;
export function runAsync<R>(asyncFn: (...args: any[]) => Promise<R>, ...args: any[]) {
    return (async() => await asyncFn(...args))() as R;
}

export type CtorParameters<T> = T extends { new (...args: infer P): T } ? P extends (Array<any> | undefined) ? P : never : never;
export type Ctor<T> = new (...args: CtorParameters<T> | Array<any>) => any;//T;
export type AbstractCtor<T> = abstract new (...args: CtorParameters<T> | Array<any>) => T;
export type PossiblyAbstractCtor<T> = Ctor<T> | AbstractCtor<T>;

export type ObjectMapFunction = ([K, V]: [string, any]) => ([string, any]);
export const mapObject = <T extends {}>(source: {}, mapFn: ObjectMapFunction | undefined): T =>
    Object.fromEntries(Array.from(Object.entries(source))
        .filter(([K, V]: [unknown, unknown]) => typeof K === 'string' && typeof V !== 'function')
        .map(mapFn ?? (([K, V]) => ([ K, V !== null && typeof V === 'object' ? mapObject(V, mapFn) : V ])))) as T;

export class Aspect {

    static aspectClasses: Array<Ctor<Aspect>> = []
    static registerAspectClasses<A extends Aspect>(...aspectClasses: Array<Ctor<A>>) {
        this.aspectClasses.push(...aspectClasses);
    }

    _: Artefact = new DummyArtefact();
    constructor(aspect: { _?: Artefact }) {
        if (aspect._ != undefined)
            this._ = aspect._;
    }

    runAsync<R>(asyncFn: (...args: any[]) => Promise<R>, ...args: any[]) {
        return runAsync(asyncFn, ...args);
    }
}

export type AspectProperties<T> = { _?: Artefact } & T;

export type AspectFunction<A extends Aspect> = ({ _, ...props }: AspectProperties<A>) => Aspect;

export type Queries<T> = {
    [K: string]: Filter<T> | undefined;
}

export class Artefact {

    static isArtefact(a: any) {
        return is<Artefact>(a, Artefact);
    }

    _id?: string;

    private aspects = new Map<PossiblyAbstractCtor<Aspect>, Aspect>();
    private static aspectTypes = new Map<PossiblyAbstractCtor<Aspect>, Array<PossiblyAbstractCtor<Aspect>>>;

    constructor() {}

    createAspect<A extends Aspect>(aspectCtor: Ctor<A>, aspectArgs: CtorParameters<A>) {
        return this.addAspect(Object.assign(new aspectCtor(...aspectArgs), { _: this }));
    }
    addAspect<A extends Aspect>(aspect: A) {
        this.aspects.set(aspect.constructor as Ctor<A>, Object.assign(aspect, { _: this }));
        return this;
    }
    getAspect<A extends Aspect>(aspectCtor: AbstractCtor<A>) {
        return this.aspects.get(aspectCtor) as A;
    }
    getAspects() {
        return this.aspects;
    }
    async toData(): Promise<this> {
        var dataUpdates = Object.fromEntries(Object.entries(
            Object.getOwnPropertyDescriptors(this)
        ).map(([K, V]) => ([K,
            !!V.get ? V.get() :
            typeof V.value === 'function' ? V.value() :
            V.value ?? undefined
        ])));
        return await pProps(dataUpdates) as this;
    }
    static addAspectType<A extends Aspect>(aspectCtor: PossiblyAbstractCtor<A>, dependencies: Array<PossiblyAbstractCtor<Aspect>>) {
        this.aspectTypes.set(aspectCtor, dependencies);
    }
    static getAspectType<A extends Aspect>(aspectCtor: PossiblyAbstractCtor<A>) {
        return this.aspectTypes.get(aspectCtor);
    }
    static getAspectTypes() {
        return this.aspectTypes;
    }
    static async* stream<T extends typeof Artefact, S extends Aspect>(this: T, source: AsyncIterable<S>) {
        for await (const aspect of source) {
            yield (new this() as InstanceType<T>).addAspect(aspect);
        }
    }

    runBackground<R, T extends ((...args: any[]) => Promise<R>)>(task: T) {
        task();
    }
    async runForeground<R, T extends ((...args: any[]) => Promise<R>)>(task: T) {
        await task();
    }
    
    query = {
        unique: () => !this._id ? undefined : ({ _id: this._id }),
    }

}

export class DummyArtefact extends Artefact {
    override createAspect<A extends Aspect>(aspectCtor: Ctor<A>, aspectArgs: CtorParameters<A>): this { throw new TypeError("Attempt to use DummyArtefact.createAspect"); }
    override addAspect<A extends Aspect>(aspect: A): this { throw new TypeError("Attempt to use DummyArtefact.addAspect"); }
    override getAspect<A extends Aspect>(aspectCtor: Ctor<Aspect>): A { throw new TypeError("Attempt to use DummyArtefact.getAspect"); }
    static override addAspectType<A extends Aspect>(aspectCtor: Ctor<A>, dependencies: Ctor<Aspect>[]): void { throw new TypeError("Attempt to use DummyArtefact.addAspectType"); }
    static override getAspectType<A extends Aspect>(aspectCtor: Ctor<A>): Ctor<Aspect>[] | undefined { throw new TypeError("Attempt to use DummyArtefact.getAspectType"); }
}
