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

export type ObjectMapFunction = ([K, V]: [string, any]) => ([string, any]);
export const mapObject = (source: {}, mapFn: ObjectMapFunction | undefined): unknown =>
    Object.fromEntries<unknown>(Array.from(Object.entries(source))
        .filter(([K, V]: [unknown, unknown]) => typeof K === 'string' && typeof V !== 'function')
        .map(mapFn ?? (([K, V]: [string, unknown]) => ([ K, V !== null && typeof V === 'object' ? mapObject(V, mapFn) : V ]))));

export class AspectClass {
    _: Artefact = new DummyArtefact();
    constructor(_?: Artefact) {
        if (_ != undefined)
            this._ = _;
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
export type AspectProperties<T> = { _/* ? */: Artefact } & T;

export type Aspect = AspectClass | AspectObject;

export type AspectFunction<A extends Aspect> = ({ _, ...props }: AspectProperties<A>) => Aspect;

export const makeAspectFunction = <A extends Aspect>(aspect: AspectFunction<A>) =>
    (({ _, ...props }: AspectProperties<A>) => aspect({ _, ...props }));
//  mapObject(aspect, ([K, V]) => ([K, props[K] ?? aspect[K]()]))

export type Queries<T> = {
    [K: string]: Filter<T> | undefined;
}

export class Artefact {
    static isArtefact(a: any) {
        return is<Artefact>(a, Artefact);
    }
    _id?: string;
    private aspects = new Map<Ctor<Aspect>, Aspect>();
    private static aspectTypes = new Map<Ctor<Aspect>, Array<Ctor<Aspect>>>;
    constructor() {}
    createAspect<A extends Aspect>(aspectCtor: Ctor<A>, aspectArgs: CtorParameters<A>) {
        return this.addAspect(Object.assign(new aspectCtor(...aspectArgs), { _: this }));
    }
    addAspect<A extends Aspect>(aspect: A) {
        this.aspects.set(aspect.constructor as Ctor<A>, Object.assign(aspect, { _: this }));
        return this;
    }
    getAspect<A extends Aspect>(aspectCtor: Ctor<A>) {
        return this.aspects.get(aspectCtor) as A;
    }
    static addAspectType<A extends Aspect>(aspectCtor: Ctor<A>, dependencies: Array<Ctor<Aspect>>) {
        this.aspectTypes.set(aspectCtor, dependencies);
    }
    static getAspectType<A extends AspectClass>(aspectCtor: Ctor<A>) {
        return this.aspectTypes.get(aspectCtor);
    }
    static async* stream<T extends Artefact, TT extends typeof Artefact, S extends AspectClass>(this: TT, source: AsyncIterable<S>) {
        for await (const aspect of source) {
            yield (new this() as T).addAspect(aspect);
        }
    }
    static query = {
        byId: (id: string | undefined) => ({ _id: id }),            // Use this when you definitely only want to use the _id (and it exists i.e. this.isNew === false)
        // byPrimary: () => { throw new TypeError(`Artefact type '${this.name}' does not provide a query.byPrimary`); },
    }
    get query(): Queries<Artefact> {
        return ({
            byId: Artefact.query.byId(this._id),
            byIdOrPrimary: this._id !== undefined ? this.query.byId : this.query.byPrimary,
            // byPrimary() { throw new TypeError(`Artefact type '${this.constructor.name}' does not provide a query.byPrimary`); },
        });
    }
}

export class DummyArtefact extends Artefact {
    override createAspect<A extends Aspect>(aspectCtor: Ctor<A>, aspectArgs: CtorParameters<A>): this { throw new TypeError("Attempt to use DummyArtefact.createAspect"); }
    override addAspect<A extends Aspect>(aspect: A): this { throw new TypeError("Attempt to use DummyArtefact.addAspect"); }
    override getAspect<A extends Aspect>(aspectCtor: Ctor<A>): A { throw new TypeError("Attempt to use DummyArtefact.getAspect"); }
    static override addAspectType<A extends Aspect>(aspectCtor: Ctor<A>, dependencies: Ctor<AspectClass>[]): void { throw new TypeError("Attempt to use DummyArtefact.addAspectType"); }
    static override getAspectType<A extends Aspect>(aspectCtor: Ctor<A>): Ctor<AspectClass>[] | undefined { throw new TypeError("Attempt to use DummyArtefact.getAspectType"); }
}
