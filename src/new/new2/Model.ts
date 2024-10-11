import { Filter } from "mongodb";

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
export type Ctor<T> = new (...args: CtorParameters<T> | Array<any>) => T;
export type AbstractCtor<T> = abstract new (...args: CtorParameters<T> | Array<any>) => T;
export type PossiblyAbstractCtor<T> = Ctor<T> | AbstractCtor<T>;

export type ObjectMapFunction = ([K, V]: [string, any]) => ([string, any]);
export const mapObject = <T extends {}>(source: {}, mapFn: ObjectMapFunction | undefined): T =>
    Object.fromEntries(Array.from(Object.entries(source))
        .filter(([K, V]: [unknown, unknown]) => typeof K === 'string' && typeof V !== 'function')
        .map(mapFn ?? (([K, V]) => ([ K, V !== null && typeof V === 'object' ? mapObject(V, mapFn) : V ])))) as T;

export class AspectClass {

    static aspectClasses: Array<Ctor<Aspect>> = []
    static registerAspectClasses<A extends Aspect>(...aspectClasses: Array<Ctor<A>>) {
        this.aspectClasses.push(...aspectClasses);
    }

    _: ArtefactClass = new DummyArtefact();
    constructor(aspect: { _?: ArtefactClass }) {
        if (aspect._ != undefined)
            this._ = aspect._;
    }

    runAsync<R>(asyncFn: (...args: any[]) => Promise<R>, ...args: any[]) {
        return runAsync(asyncFn, ...args);
    }
}

export type AspectObject = {
    [K: string]: Function;
}
/*export type AspectProperties = {
    [K: string]: any;
} */
export type AspectProperties<T> = { _?: ArtefactClass } & T;

export type Aspect = AspectClass | AspectObject;

export type AspectFunction<A extends Aspect> = ({ _, ...props }: AspectProperties<A>) => Aspect;

// export const makeAspectFunction = <A extends AspectObject>(aspect: A) =>
//     ({ _, ...props }: ({ _: Artefact } & A)) =>
//         ({ _, ...mapObject(props, ([K, V]) => ([K, props[K] ?? V])) });

export type Queries<T> = {
    [K: string]: Filter<T> | undefined;
}

export class ArtefactClass {

    static isArtefact(a: any) {
        return is<ArtefactClass>(a, ArtefactClass);
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
    getAspect<A extends Aspect>(aspectCtor: PossiblyAbstractCtor<A>) {
        return this.aspects.get(aspectCtor) as A;
    }
    getAspects() {
        return this.aspects;
    }
    static addAspectType<A extends Aspect>(aspectCtor: PossiblyAbstractCtor<A>, dependencies: Array<PossiblyAbstractCtor<Aspect>>) {
        this.aspectTypes.set(aspectCtor, dependencies);
    }
    static getAspectType<A extends AspectClass>(aspectCtor: PossiblyAbstractCtor<A>) {
        return this.aspectTypes.get(aspectCtor);
    }
    static getAspectTypes() {
        return this.aspectTypes;
    }
    static async* stream<T extends typeof ArtefactClass, S extends AspectClass>(this: T, source: AsyncIterable<S>) {
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

// export interface Artefact {
//     stream<T extends ArtefactClass, TT extends typeof ArtefactClass, S extends AspectClass>(this: TT, source: AsyncIterable<S>): AsyncGenerator<T, never, S>;
// }
// export declare var Artefact: Artefact;
// Artefact.stream = function stream<T extends ArtefactClass, TT extends typeof ArtefactClass, S extends AspectClass>(this: TT, source: AsyncIterable<S>): AsyncGenerator<T, never, S> {

// }

export class DummyArtefact extends ArtefactClass {
    override createAspect<A extends Aspect>(aspectCtor: Ctor<A>, aspectArgs: CtorParameters<A>): this { throw new TypeError("Attempt to use DummyArtefact.createAspect"); }
    override addAspect<A extends Aspect>(aspect: A): this { throw new TypeError("Attempt to use DummyArtefact.addAspect"); }
    override getAspect<A extends Aspect>(aspectCtor: Ctor<A>): A { throw new TypeError("Attempt to use DummyArtefact.getAspect"); }
    static override addAspectType<A extends Aspect>(aspectCtor: Ctor<A>, dependencies: Ctor<AspectClass>[]): void { throw new TypeError("Attempt to use DummyArtefact.addAspectType"); }
    static override getAspectType<A extends Aspect>(aspectCtor: Ctor<A>): Ctor<AspectClass>[] | undefined { throw new TypeError("Attempt to use DummyArtefact.getAspectType"); }
}
