import { Filter } from "mongodb";

export type DataProperties<T> = { [K in keyof T as T[K] extends Function ? never : K]: T[K]; };
export type DataRequiredProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>>;
export type DataOptionalProperties<T, K extends keyof T = keyof T> = Partial<DataProperties<Pick<T, K>>>;
export type DataRequiredAndOptionalProperties<T, KR extends keyof T = never, KO extends keyof T = keyof T> = DataProperties<Pick<T, KR>> & Partial<DataProperties<Pick<T, KO>>>;

export type CtorParameters<T> = T extends { new (...args: infer P): T } ? P : never;
export type Ctor<T, TArgs extends Array<any> | [] = [CtorParameters<T>]> = Function & { new (...args: TArgs): T; };
export type AbstractCtor<T, TArgs extends Array<any> | [] = [CtorParameters<T>]> = abstract new (...args: TArgs) => T;
export type PossiblyAbstractCtor<T, TArgs extends Array<any> | [] = [CtorParameters<T>]> = Ctor<T, TArgs> | AbstractCtor<T, TArgs>;
export const isCtor = <T>(value: any): value is Ctor<T> => value.prototype.constructor === value;

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

export type ObjectFilterFunction = ([K, V]: [string, any], depth: number, prefix: string) => boolean;
export const filterObject = <T extends {}>(source: {} | undefined, filterFn: ObjectFilterFunction, maxDepth: number = 0, depth: number = 0, prefix: string = ""): T =>
    (!source ? source : Object.fromEntries(Array.from(Object.entries(source ?? {}))
        .filter(([K, V]) => filterFn([K, V], depth, prefix))
        .map(([K, V]) => ([K, (V !== null && typeof V === 'object' && (depth < maxDepth)) ?
            filterObject(V, filterFn, maxDepth, depth + 1, prefix + "." + K) : V])))) as T;

export type ObjectMapFunction = ([K, V]: [string, any], depth: number, prefix: string) => ([string, any]);
export const mapObject = <T extends {}>(source: {} | undefined, mapFn: ObjectMapFunction, maxDepth: number = 0, depth: number = 0, prefix: string = ""): T =>
    (!source ? source : Object.fromEntries(Array.from(Object.entries(source))
        .filter(([K, V]) => typeof K === 'string' && typeof V !== 'function')
        .map((([K, V]) => ([ K, V !== null && typeof V === 'object' && (depth < maxDepth) ?
            mapObject(V, mapFn, maxDepth, depth + 1, prefix + "." + K) : V ]))))) as T;

export type AspectCtorParameters<T extends Aspect> = T extends { new (...args: infer P): T } ? P : never;
export type AspectCtor<
    T extends Aspect,
    TArgs extends Array<any> | [] = any[],
    TCreateArgs extends Array<any> | [] = any[],
> = Function & {
    new (...args: TArgs): T;
    create(...args: TCreateArgs): Promise<T>;
};
export type AspectAbstractCtor<T extends Aspect, TArgs extends Array<any>  = AspectCtorParameters<T>> = abstract new (...args: TArgs) => T;
export type AspectPossiblyAbstractCtor<T extends Aspect, TArgs extends Array<any>  = AspectCtorParameters<T>> = AspectCtor<T, TArgs> | AspectAbstractCtor<T, TArgs>;
export const isAspectCtor = <T extends Aspect>(value: any): value is AspectCtor<T> => (function testValuePrototype(value: any, testFn: (value: any) => boolean): boolean {
    return testFn(value) || testValuePrototype(value.prototype, testFn);
})(value, value => value.constructor === Aspect);

export type AspectProperties<T extends Aspect, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type AspectDataProperties<T extends Aspect, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type AspectDataRequiredProperties<T extends Aspect, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type AspectDataOptionalProperties<T extends Aspect, K extends keyof T = keyof T> = Partial<DataProperties<Pick<T, K>>> & { _?: Artefact };
export type AspectDataRequiredAndOptionalProperties<T extends Aspect, KR extends keyof T = never, KO extends keyof T = keyof T> =
    DataProperties<Pick<T, KR>> &
    Partial<DataProperties<Pick<T, Exclude<KO, KR>>>> &
    { _?: Artefact };

export type AspectFunction<T extends Aspect, A extends Artefact = Artefact> = ({ _, ...props }: AspectProperties<T>) => A;

export abstract class Aspect {
    #_?: Artefact;
    public get _() { return this.#_; }
    private set _(_: Artefact | undefined) { this.#_ = _; }

    constructor({ _ }: DataProperties<Aspect>) { this._ = _; }

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

    static async create(this: typeof Aspect, ...props: any[]): Promise<InstanceType<typeof this>> {
        return new (this as AspectCtor<InstanceType<typeof this>>)(...props);
    }

    #init: Promise<this> = Promise.resolve(this);
    protected async init<I extends any[]>(initFn?: (...args: I) => Promise<void>, ...args: I) {
        return !initFn ? this.#init : this.#init.then(() => initFn(...args));
    }
}

export type Queries<T> = {
    [K: string]: Filter<T> | undefined;
}

export type ArtefactCtor<T extends Artefact, TArgs extends Array<any> | [] = ArtefactCtorParameters<T>> = Function & { new (...args: TArgs | []): T; };
export type ArtefactCtorParameters<T extends Artefact> = T extends { new (...args: infer P): T } ? P : never;
export type ArtefactAbstractCtor<T extends Artefact, TArgs extends Array<any> | [] = ArtefactCtorParameters<T>> = abstract new (...args: TArgs | []) => T;
export type ArtefactPossiblyAbstractCtor<T extends Artefact, TArgs extends Array<any> | [] = ArtefactCtorParameters<T>> = ArtefactCtor<T, TArgs> | ArtefactAbstractCtor<T, TArgs>;
export const isArtefactCtor = <T extends Artefact>(value: any): value is ArtefactCtor<T> => (function testValuePrototype(value: any, testFn: (value: any) => boolean): boolean {
    return testFn(value) || testValuePrototype(value.prototype, testFn);
})(value, value => value.constructor === Artefact);

export type ArtefactProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type ArtefactDataProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type ArtefactDataRequiredProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>> & { _?: Artefact };
export type ArtefactDataOptionalProperties<T, K extends keyof T = keyof T> = Partial<DataProperties<Pick<T, K>>> & { _?: Artefact };
export type ArtefactDataRequiredAndOptionalProperties<T, KR extends keyof T = never, KO extends keyof T = keyof T> =
    DataProperties<Pick<T, KR>> &
    Partial<DataProperties<Pick<T, KO>>> &
    { _?: Artefact };

export class Artefact {
    static is(a: any) { return is(a, this); }

    _id?: string;
    private aspects = new Map<AspectPossiblyAbstractCtor<Aspect>, Aspect>();
    private static aspectTypes = new Map<AspectPossiblyAbstractCtor<Aspect>, Array<AspectPossiblyAbstractCtor<Aspect>>>;

    async createAspect<A extends Aspect, TArgs extends any[] | [] = Parameters<AspectCtor<A>["create"]>>(aspectCreator: AspectCtor<A>, ...aspectArgs: TArgs) {
        const aspect = await aspectCreator.create(...[Object.assign(aspectArgs[0], { _: this }), ...aspectArgs.slice(1)]);
        this.addAspect(aspect);
        return aspect as A;
    }
    addAspect(aspect: Aspect) {
        this.aspects.set(aspect.constructor as AspectCtor<Aspect>, Object.assign(aspect, { _: this }));
        return this;
    }
    getAspect<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>): A {
        console.log(`getAspect(): ${JSON.stringify(aspectCtor.name)}`);
        const result = filterObject<A>(this.aspects.get(aspectCtor) as A, ([K, V]) => K !== '_');
        console.log(`getAspect(): result = ${JSON.stringify(result)}`);
        return result;
    }
    getAspects() {
        return this.aspects;
    }
    async toData<A extends Artefact>(this: A): Promise<ArtefactProperties<A>> {
        console.log(`toData(): this = ${JSON.stringify(this)}`);
        var dataUpdates = Object.fromEntries(Object.entries(
            Object.getOwnPropertyDescriptors(this.constructor.prototype))
                .filter(([K, V]) => K !== 'constructor' && K !== '_')
                .map(([K, V]) => ([K,
                    !!V.get ? V.get.call(this) :
                    !!V.value ? typeof V.value === 'function' ? V.value.call(this) : V.value
                    : undefined
                ])));
        console.log(`toData(): dataUpdates = ${JSON.stringify(dataUpdates)}`);
        const result = { ...(await pProps(dataUpdates) as ArtefactProperties<A>), _ts: new Date() };
        console.log(`toData(): result = ${JSON.stringify(result)}`);
        return result;
    }
    static addAspectType<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>, dependencies: Array<AspectPossiblyAbstractCtor<Aspect>>) {
        this.aspectTypes.set(aspectCtor, dependencies);
    }
    static getAspectType<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>) {
        return this.aspectTypes.get(aspectCtor);
    }
    static getAspectTypes() {
        return this.aspectTypes;
    }
    static async* stream<S extends Aspect, T extends Artefact>(this: ArtefactCtor<T>, source: AsyncIterable<S>) {
        for await (const aspect of source) {
            yield (new this()).addAspect(aspect);
        }
    }

    static Type(schema: Array<AspectCtor<Aspect>>) {
        const c = class {
            static is(a: any) { return is(a, this); }
            _id?: string;
            get isNew() { return !this._id; }
        };
    }

    runBackground<R, T extends ((...args: any[]) => Promise<R>)>(task: T) {
        task();
    }
    async runForeground<R, T extends ((...args: any[]) => Promise<R>)>(task: T) {
        await task();
    }
    
    get query(): Queries<Artefact> {
        return ({
            unique: !this._id ? undefined : ({ _id: { $eq: this._id } }),
        });
    }

}
