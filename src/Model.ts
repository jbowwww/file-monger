import { Filter } from "mongodb";
import { isPromise } from "node:util/types";

export type AnyParameters = any[] | [];
export type DataProperties<T> = { [K in keyof T as T[K] extends Function ? never : K]: T[K]; };
export type DataRequiredProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>>;
export type DataOptionalProperties<T, K extends keyof T = keyof T> = Partial<DataProperties<Pick<T, K>>>;
export type DataRequiredAndOptionalProperties<T, KR extends keyof T = never, KO extends keyof T = keyof T> = DataProperties<Pick<T, KR>> & Partial<DataProperties<Pick<T, KO>>>;

export type CtorParameters<T> = T extends { new (...args: infer P): T } ? P extends [] ? [] : P : never;
export type Ctor<T, TArgs extends AnyParameters = CtorParameters<T>> = Function & { new (...args: TArgs): T; };
export type AbstractCtor<T, TArgs extends AnyParameters = CtorParameters<T>> = abstract new (...args: TArgs) => T;
export type PossiblyAbstractCtor<T, TArgs extends AnyParameters = CtorParameters<T>> = Ctor<T, TArgs> | AbstractCtor<T, TArgs>;
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

export type AspectCtorParameters<T extends Aspect> = T extends { new (...args: infer P): T } ? P extends [] ? [] : P : never;
export type AspectCtor<
    A extends Aspect,
    TArgs extends AnyParameters = AspectCtorParameters<A>,//any[],
    TCreateArgs extends AnyParameters = any[],
> = Function & {
    new (...args: TArgs): A;
    create(...args: TCreateArgs): Promise<A>;
};
export type AspectAbstractCtor<A extends Aspect, TArgs extends AnyParameters = AspectCtorParameters<A>> = abstract new (...args: TArgs) => A;
export type AspectPossiblyAbstractCtor<A extends Aspect, TArgs extends AnyParameters = AspectCtorParameters<A>> = AspectCtor<A, TArgs> | AspectAbstractCtor<A, TArgs>;
export const isAspectCtor = <A extends Aspect>(value: any): value is AspectCtor<A> => (function testValuePrototype(value: any, testFn: (value: any) => boolean): boolean {
    return testFn(value) || testValuePrototype(value.prototype, testFn);
})(value, value => value.constructor === Aspect);

export type AspectCreateParameters<A extends Aspect> = Parameters<AspectCtor<A>["create"]>
export type AspectProperties<A extends Aspect, K extends keyof A = keyof A> = DataProperties<Pick<A, K>> & { _?: Artefact };
export type AspectDataProperties<A extends Aspect, K extends keyof A = keyof A> = DataProperties<Pick<A, K>> & { _?: Artefact };
export type AspectDataRequiredProperties<A extends Aspect, K extends keyof A = keyof A> = DataProperties<Pick<A, K>> & { _?: Artefact };
export type AspectDataOptionalProperties<A extends Aspect, K extends keyof A = keyof A> = Partial<DataProperties<Pick<A, K>>> & { _?: Artefact };
export type AspectDataRequiredAndOptionalProperties<A extends Aspect, KR extends keyof A = never, KO extends keyof A = keyof A> =
    DataProperties<Pick<A, KR>> &
    Partial<DataProperties<Pick<A, Exclude<KO, KR>>>> &
    { _?: Artefact };

export type AspectFunction<P extends Aspect, A extends Artefact = Artefact> = ({ _, ...props }: AspectProperties<P>) => A;

export abstract class Aspect {
    #_?: Artefact;
    public get _() { return this.#_; }
    private set _(_: Artefact | undefined) { this.#_ = _; }

    constructor(aspect: any/* : DataProperties<Aspect> */) {
        Object.assign(this, aspect);
    }

    static async create<A extends Aspect>(this: AspectCtor<A>, ...props: any[]): Promise<Aspect> {
        return new this(...props as AspectCtorParameters<A>);
    }

    toString() {
        return `[${this.constructor.name}: ${JSON.stringify(this)}]`;
    }
}

export type Queries<T> = {
    [K: string]: Filter<T> | undefined;
}

export type ArtefactCtorParameters<A extends Artefact> = A extends { new (...args: infer P): A } ? P extends [] ? [] : P : never;
export type ArtefactCtor<A extends Artefact, TArgs extends AnyParameters = ArtefactCtorParameters<A>> = Function & { new (...args: TArgs | []): A; };
export type ArtefactAbstractCtor<A extends Artefact, TArgs extends AnyParameters = ArtefactCtorParameters<A>> = abstract new (...args: TArgs | []) => A;
export type ArtefactPossiblyAbstractCtor<A extends Artefact, TArgs extends AnyParameters = ArtefactCtorParameters<A>> = ArtefactCtor<A, TArgs> | ArtefactAbstractCtor<A, TArgs>;
export const isArtefactCtor = <A extends Artefact>(value: any): value is ArtefactCtor<A> => (function testValuePrototype(value: any, testFn: (value: any) => boolean): boolean {
    return testFn(value) || testValuePrototype(value.prototype, testFn);
})(value, value => value.constructor === Artefact);

export type ArtefactProperties<A extends Artefact, K extends keyof A = keyof A> = DataProperties<Pick<A, K>>;
export type ArtefactDataProperties<A extends Artefact, K extends keyof A = keyof A> = DataProperties<Pick<A, K>>;
export type ArtefactDataRequiredProperties<A extends Artefact, K extends keyof A = keyof A> = DataProperties<Pick<A, K>>;
export type ArtefactDataOptionalProperties<A extends Artefact, K extends keyof A = keyof A> = Partial<DataProperties<Pick<A, K>>>;
export type ArtefactDataRequiredAndOptionalProperties<A extends Artefact, KR extends keyof A = never, KO extends keyof A = keyof A> =
    DataProperties<Pick<A, KR>> &
    Partial<DataProperties<Pick<A, KO>>>;

export type Timestamped<T> = T & { _ts: Date; };

export class Artefact {
    public static is(a: any) { return is(a, this); }
    private static timestamp(value: any) {
        return ({ ...value, _ts: new Date(), });
    }
    
    _id?: string;
    _ts: Date = new Date();

    private aspects = new Map<AspectPossiblyAbstractCtor<Aspect>, Aspect>();
    private static aspectTypes = new Map<AspectPossiblyAbstractCtor<Aspect>, Array<AspectPossiblyAbstractCtor<Aspect>>>;

    constructor(props?: { _id?: string, _ts?: Date }) {
        this._id = props?._id;
        this._ts = props?._ts ?? new Date();
        Object.assign(this, props);
    }

    toString<A extends Artefact>(this: A) {
        return `[${this.constructor.name}: _id=${this._id}\n\t` +
            `aspects=${JSON.stringify(Array.from(this.aspects.entries()).map(([K, V]) => ([K.name, V])))}\n\t` +
            `query=${JSON.stringify(this.query)}]`;
    }

    async createAspect<
        A extends Aspect,
        TCreateArgs extends AnyParameters = Parameters<AspectCtor<A>["create"]>
    >(aspectCreator: AspectCtor<A>, ...aspectArgs: TCreateArgs) {
        const aspect = await aspectCreator.create(...[Object.assign(aspectArgs[0], { _: this }), ...aspectArgs.slice(1)]);
        this.addAspect(aspect);
        return aspect;
    }
    addAspect(aspect: Aspect) {
        this.aspects.set(aspect.constructor as AspectCtor<Aspect>, Object.assign(aspect, { _: this }));
        return this;
    }
    getAspect<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>) {
        // const result = filterObject<A>(this.aspects.get(aspectCtor) as A, ([K, V]) => K !== '_');
        return this.aspects.get(aspectCtor) as A | undefined;
    }

    async* toData/* <A extends Artefact> */(): AsyncGenerator<Timestamped<Partial<this/* A */>>, Timestamped<this/* A */>, undefined> {
        console.log(`toData(): this = ${this}`);
        var dataUpdates = Object.fromEntries(Object.entries(
            Object.getOwnPropertyDescriptors(this.constructor.prototype))
                .filter(([K, V]) => K !== 'constructor' && K !== '_' && K !== 'query')
                .map(([K, V]) => ([K,
                    !!V.get ? V.get.call(this) :
                    !!V.value ? typeof V.value === 'function' ? V.value.call(this) : V.value
                    : undefined
                ])));
        console.log(`toData(): dataUpdates = ${JSON.stringify(dataUpdates)}`);
        // Object.assign(this, dataUpdates);
        yield { ...filterObject(dataUpdates, ([K, V]) => !isPromise(V)), _ts: new Date() };
        const result = { ...await pProps(dataUpdates), _ts: new Date() };
        // Object.assign(this, result);
        console.log(`toData(): result = ${JSON.stringify(result)}`);
        yield { ...result, _ts: new Date() };
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
    static async* stream<S extends Aspect, A extends Artefact>(this: ArtefactCtor<A>, source: AsyncIterable<S>) {
        for await (const aspect of source) {
            yield (new this()).addAspect(aspect);
        }
    }

    get query(): Queries<Artefact> {
        return ({
            unique: !this._id ? undefined : ({ _id: { $eq: this._id } }),
        });
    }
}
