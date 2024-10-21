import { Filter } from "mongodb";

export const pProps = async (o: any) => {
    const tasks = Object.entries(o).map(([k, v]: [string, any]) => Promise.resolve(o[k]).then(v => o[k] = v));
    await Promise.all(tasks);
    return o;
};

export type PipelineStage<TIn, TOut> = (data: TIn) => Promise<TOut>;
export const pipeline = <
    P extends Array<PipelineStage<any, any>>,
    I extends Array<any>
>(...stages: P) => (...inputData: I) => stages.reduce(
    async (data, stage, index, arr) => await pProps(stage(data)),
    Promise.resolve(inputData)
);

export const is = <T>(value: any, typeCtor: Ctor<T>): value is T => value.constructor == typeCtor;
export type PromiseValue<T extends Promise<any>> = T extends Promise<infer R> ? R : never;

export type CtorParameters<T> = T extends { new (...args: infer P): T } ? P extends Array<any> ? P : [P] : Array<any>;
export type Ctor<T, TArgs extends Array<any> /* | any | [] */ | never = CtorParameters<T>> = Function & (/* TArgs extends Array<any> ? */ new (...args: TArgs) => T /* : new (arg: TArgs) => T */);
export type AbstractCtor<T, TArgs extends Array<any> = CtorParameters<T>> = abstract new (...args: TArgs) => T;
export type PossiblyAbstractCtor<T, TArgs extends Array<any> = CtorParameters<T>> = Ctor<T, TArgs> | AbstractCtor<T, TArgs>;
export const isCtor = <T>(value: any): value is Ctor<T> => value

export type ObjectFilterFunction = ([K, V]: [string, any], depth: number, prefix: string) => boolean;
export const filterObject = <T extends {}>(source: {}, filterFn: ObjectFilterFunction, maxDepth: number = 0, depth: number = 0, prefix: string = ""): T =>
    Object.fromEntries(Array.from(Object.entries(source))
        .filter(([K, V]: [string, any], index, arr) => filterFn([K, V], depth, prefix))
        .map(([K, V]: [string, any]) => (typeof V === 'object' && (depth < maxDepth)) ? filterObject(V, filterFn, maxDepth, depth + 1, prefix + "." + K) : V)) as T;

export type ObjectMapFunction = ([K, V]: [string, any], depth: number, prefix: string) => ([string, any]);
export const mapObject = <T extends {}>(source: {}, mapFn: ObjectMapFunction, maxDepth: number = 0): T =>
    Object.fromEntries(Array.from(Object.entries(source))
        .filter(([K, V]: [unknown, unknown]) => typeof K === 'string' && typeof V !== 'function')
        .map((([K, V]) => ([ K, V !== null && typeof V === 'object' ? mapObject(V, mapFn) : V ])))) as T;

export abstract class Aspect {
    #_?: Artefact;
    public get _() { return this.#_; }
    private set _(_: Artefact | undefined) { this.#_ = _; }

    constructor({ _ }: AspectDataOptionalProperties<Aspect>) { this._ = _; }

    public addToArtefact(_: Artefact) {
        this._ = _;
        this.onAddedToArtefact(_);
    }
    protected onAddedToArtefact<A extends Artefact>(_: A) {}

    #tasks: Array<Promise<any>> = [];
    runAsync<R, T extends ((...args: any[] | any) => Promise<R>)>(task: T) {
        const taskPromise = task.bind(this)();
        this.#tasks.push(taskPromise);
    }
    finishTasks() { return Promise.all(this.#tasks); }

    static async create(props: AspectDataProperties<any>): Promise<InstanceType<typeof Aspect>> {
        throw new TypeError(`Aspect-derived type \"${this.name}\" needs to override Aspect.create()`);
    }
}

export type AspectProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type AspectDataProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type AspectDataRequiredProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type AspectDataOptionalProperties<T, K extends keyof T = keyof T> = Partial<DataProperties<Pick<T, K>>> & { _?: Artefact };
export type AspectDataRequiredAndOptionalProperties<T, KR extends keyof T = keyof T, KO extends keyof T = keyof T> =
    DataProperties<Pick<T, KR>> &
    Partial<DataProperties<Pick<T, KO>>> &
    { _?: Artefact };
export type AspectFunction<T extends Aspect, A extends Artefact = Artefact> = ({ _, ...props }: AspectProperties<T>) => A;

export type Queries<T> = {
    [K: string]: () => Filter<T> | undefined;
}

export type DataProperties<T> = { [K in keyof T as T[K] extends Function ? never : K]: T[K]; };
export type ArtefactProperties<A extends Artefact> = DataProperties<A> & { _ts: Date };

export type ArtefactSchema = {
    
}
export class Artefact {
    static is(a: any) { return is(a, this); }

    _id?: string;
    private aspects = new Map<PossiblyAbstractCtor<Aspect>, Aspect>();
    private static aspectTypes = new Map<PossiblyAbstractCtor<Aspect>, Array<PossiblyAbstractCtor<Aspect>>>;

    async createAspect<A extends /* typeof */ Aspect, TArgs extends Array<any> = Parameters<typeof Aspect["create"]>>(aspectCreator: typeof Aspect /* Ctor<A, TArgs> */, ...aspectArgs: TArgs) {
        return this.addAspect(await aspectCreator.create(({ ...aspectArgs[0], _: this })));
    }
    addAspect/* <A extends Artefact> */(/* this: A, */ aspect: Aspect) {
        this.aspects.set(aspect.constructor as Ctor<Aspect>, Object.assign(({ ...aspect, _: this })));
        return this/*  as A */;
    }
    getAspect<A extends Aspect>(aspectCtor: PossiblyAbstractCtor<A>): A {
        return this.aspects.get(aspectCtor) as A;
    }
    getAspects() {
        return this.aspects;
    }
    async toData<A extends Artefact>(this: A): Promise<ArtefactProperties<A>> {
        var dataUpdates = Object.fromEntries(Object.entries(
            Object.getOwnPropertyDescriptors(this.constructor.prototype)
        ).filter(([K, V]) => K !== 'constructor')
        .map(([K, V]) => ([K,
            !!V.get ? V.get.call(this) :
            !!V.value ?
                typeof V.value === 'function' ? V.value.call(this) : V.value
            : undefined
        ]))); //typeof V === 'function' ? V() : V])));
        console.log(`toData(): ${JSON.stringify(dataUpdates)}`);
        const result = { ...(await pProps(dataUpdates) as ArtefactProperties<A>), _ts: new Date() };
        console.log(`toData(): ${JSON.stringify(result)}`);
        return result;
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
    static async* stream<S extends Aspect, T extends Artefact>(this: Ctor<T, CtorParameters<T> | []>, source: AsyncIterable<S>) {
        for await (const aspect of source) {
            yield (new this()).addAspect(aspect);
        }
    }

    static Type(schema: Array<Ctor<Aspect>>) {
        const c = class {
            static is(a: any) { return is(a, this); }
            _id?: string;
            get isNew() { return !this._id; }
        };
        // Object.defineProperties(c.prototype, mapObject(schema, ))
    }

    runBackground<R, T extends ((...args: any[]) => Promise<R>)>(task: T) {
        task();
    }
    async runForeground<R, T extends ((...args: any[]) => Promise<R>)>(task: T) {
        await task();
    }
    
    query: Queries<Artefact> = {
        unique: () => !this._id ? undefined : ({ _id: { $eq: this._id } }),
    }

}
