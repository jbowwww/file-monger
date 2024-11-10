// import EventEmitter from "events";
import { Filter } from "mongodb";
import "reflect-metadata";
import { isPromise } from "util/types";

export type AnyParameters = any[] | [];
export type DataProperties<T> = { [K in keyof T as T[K] extends Function ? never : K]: T[K]; };
export type DataRequiredProperties<T, K extends keyof T = keyof T> = DataProperties<Pick<T, K>>;
export type DataOptionalProperties<T, K extends keyof T = keyof T> = Partial<DataProperties<Pick<T, K>>>;
export type DataRequiredAndOptionalProperties<T, KR extends keyof T = never, KO extends keyof T = keyof T> = DataProperties<Pick<T, KR>> & Partial<DataProperties<Pick<T, KO>>>;

export type CtorParameters<T> = T extends { new (...args: infer P): T } ? P : never;
export type Ctor<T, TArgs extends AnyParameters = CtorParameters<T>> = { new (...args: TArgs): T; };
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

export const is = <T>(value: any, typeCtor: PossiblyAbstractCtor<T>): value is T => value.constructor === typeCtor;
export const isOrDerives = <T>(value: any, typeCtor: PossiblyAbstractCtor<T>): value is T => value.constructor === typeCtor || isOrDerives(value.prototype, typeCtor);

export type PromiseValue<T extends Promise<any>> = T extends Promise<infer R> ? R : never;

export type ObjectFilterFunction = ([K, V]: [string, any], depth: number, prefix: string) => boolean;
export const filterObject = <T extends {}>(source: {} | undefined, filterFn: ObjectFilterFunction, maxDepth: number = 0, depth: number = 0, prefix: string = ""): T =>
    (!source ? source : Object.fromEntries(Array.from(Object.entries(source ?? {}))
        .filter(([K, V]) => filterFn([K, V], depth, prefix))
        .map(([K, V]) => ([K, (V !== null && typeof V === 'object' && (depth <= maxDepth)) ?
            filterObject(V, filterFn, maxDepth, depth + 1, prefix + "." + K) : V])))) as T;

export type ObjectMapFunction = ([K, V]: [string, any], depth: number, prefix: string) => ([string, any]);
export const mapObject = <T extends {}>(source: {} | undefined, mapFn: ObjectMapFunction, maxDepth: number = 0, depth: number = 0, prefix: string = ""): T =>
    (!source ? source : Object.fromEntries(Array.from(Object.entries(source))
        .filter(([K, V]) => typeof K === 'string' && typeof V !== 'function')
        .map((([K, V]) => ([ K, V !== null && typeof V === 'object' && (depth <= maxDepth) ?
            mapObject(V, mapFn, maxDepth, depth + 1, prefix + "." + K) : V ]))))) as T;

export type AspectCtorParameters<A extends Aspect> = A extends abstract new (...args: infer P) => A ? P : never;
export type AspectCtor<
    A extends Aspect,
    TArgs extends AnyParameters = AspectCtorParameters<A>,
    TCreateArgs extends AnyParameters = any[],
> = {
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
    static is<A extends Aspect>(this: AspectPossiblyAbstractCtor<A>, a: any): a is A { return is(a, this); }
    static isOrDerives<A>(value: any, typeCtor: typeof Aspect = this): value is A { return isOrDerives(value, typeCtor); }
    
    #_?: Artefact;
    public get _() { return this.#_; }
    private set _(_: Artefact | undefined) { this.#_ = _; }

    toString() { return `[${this.constructor.name}: ${JSON.stringify(filterObject(this, ([K, V]) => K !== "_" && typeof V !== 'function'))}]`; }
    
    constructor({ _ }: DataProperties<Aspect>) { this.#_ = _; }
    
    onAddedToArtefact<A extends Artefact>(_: A) { this.#_ = _; }

    static async create<A extends Aspect>(this: AspectCtor<A>, ...props: any[]): Promise<Aspect> {
        return new this(...props as AspectCtorParameters<A>);
    }
}

export type Queries<T> = {
    [K: string]: Filter<T> | undefined;
}

export type ArtefactCtorParameters<A extends Artefact> = A extends new (...args: infer P) => A ? P : A extends new () => A ? [] : never;
export type ArtefactCtor<A extends Artefact, TArgs extends AnyParameters = ArtefactCtorParameters<A>> = ((new (...args: TArgs) => A) | (new () => A)) & { name: string; prototype: any; };
export type ArtefactAbstractCtor<A extends Artefact, TArgs extends AnyParameters = ArtefactCtorParameters<A>> = (abstract new (...args: TArgs) => A & { name: string; prototype: any; });
export type ArtefactPossiblyAbstractCtor<A extends Artefact, TArgs extends AnyParameters = ArtefactCtorParameters<A>> = ArtefactCtor<A, TArgs> | ArtefactAbstractCtor<A, TArgs>;
export const isArtefactCtor = <A extends Artefact>(value: any): value is ArtefactCtor<A> => (function testValuePrototype(value: any, testFn: (value: any) => boolean): boolean {
    return testFn(value) || testValuePrototype(value.prototype, testFn);
})(value, value => value.constructor === Artefact);

export type ArtefactDataProperties<A extends Artefact, K extends keyof A = keyof A> = DataProperties<Omit<Pick<A, K>, "query">>;
export type ArtefactDataRequiredProperties<A extends Artefact, K extends keyof A = keyof A> = DataProperties<Omit<Pick<A, K>, "query">>;
export type ArtefactDataOptionalProperties<A extends Artefact, K extends keyof A = keyof A> = Partial<DataProperties<Omit<Pick<A, K>, "query">>>;
export type ArtefactDataRequiredAndOptionalProperties<A extends Artefact, KR extends keyof A = never, KO extends keyof A = keyof A> =
    Omit<
        DataProperties<Pick<A, KR>> &
        Partial<DataProperties<Pick<A, KO>>
    >, "query">;

export type Timestamped<T> = T & { _ts: Date; };
export type Id<T> = T & { _id?: string; };

export type ArtefactDownstreams = {
    [K: string]: (this: Artefact, ...args: AnyParameters) => any;
};
export function stringify(downstreams: ArtefactDownstreams) {
    return JSON.stringify(mapObject(downstreams, ([K, V]) => ([K, V.toString()])));
}

export class Artefact/*  extends EventEmitter */ {
    
    static is<A extends Artefact = Artefact>(this: Ctor<A>, a: any) { return is(a, this); }
    // static #dependencies = new Map<string, ArtefactDownstreams>();
    // static #aspectTypes = new Map<AspectPossiblyAbstractCtor<Aspect>, Array<AspectPossiblyAbstractCtor<Aspect>>>;
    // static aspectGetters = new Map<AspectPossiblyAbstractCtor<Aspect>, (...args: AnyParameters) => Aspect>();
    
    [K: string | symbol]: any;
    _id?: string;

    // private aspects = new Map<string, Aspect>();
    // private aspectsPending: Record<string, Promise<Aspect>> = {};
    
    // constructor() {
    //     // super({ captureRejections: true });
    //     // this.on("addAspect", async (aspect, aspectCtor) => {
    //     //     const downstreams = Reflect.getMetadata("downstreams", this, aspectCtor.name) as ArtefactDependencies[] ?? [];
    //     //     console.log(`Artefact.on("aspect"): aspectCtor.name=${aspectCtor.name} aspect=${aspect} downstreams=${JSON.stringify(downstreams)}`);
    //     //     const getterTasks = downstreams.map(async d => {
    //     //         const value = await d.getter();
    //     //         Object.defineProperty(this, d.name, { enumerable: true, configurable: true, value });
    //     //         return value;
    //     //     });
    //     //     const getterEntries = Object.fromEntries(Array.from(await Promise.all(getterTasks)).map((v: Aspect, i: number) => ([downstreams[i], v])));
    //     //     console.log(`Artefact.on("aspect"): aspectCtor.name=${aspectCtor.name} aspect=${aspect} downstreams=${downstreams} getterEntries=${getterEntries}`);
    //     // });
    //     const _this = this;
    //     return new Proxy(this, {
    //         set(this: Artefact, _: any, K: string, newValue: any, receiver: any) {
    //             const downstreams = Reflect.getMetadata("downstreams", _, K) ?? {} as ArtefactDownstreams;
    //             if (Aspect.isPrototypeOf(newValue)) {
    //                 this.addAspect(newValue);
    //             } else {
    //                 this[K] = newValue;
    //             }
    //             return true;
    //         },
    //         get(this: Artefact, _: any, K: string, receiver: any) {
    //             const aspectType = Reflect.getMetadata("design:type", _, K);
    //             if (Aspect.isPrototypeOf(aspectType)) {
    //                 if (_.aspects.has(K)) {
    //                     return _.aspects.get(K);
    //                 } else {
    //                     const descriptor = Object.getOwnPropertyDescriptor(_, K);
    //                     const getter = descriptor?.get;
    //                     if (!!getter) {
    //                         const gotValue = getter.apply(this);
    //                         this.addAspect(gotValue);
    //                     }
    //                 }
    //             } else {
    //                 return _[K];
    //             }
    //         },
    //     })
    // }

    // static depends<A extends Artefact>(/* this: ArtefactCtor<A>, */ ...dependencies: string[]) {
    //     const artefactType = this;
    //     return function(/* this: ArtefactCtor<A>, */ _: any, K: string, descriptor: PropertyDescriptor) {
    //         console.log(`Artefact.depends(): artefactType.name=${artefactType.name} K=${K} dependencies=${dependencies}`);// _.name=${_.toString.call(_)}
    //         // / TODO: store dependencies info for use by proxify below in set/get accessors
    //         // dependencies.map(d => Reflect.defineMetadata("dependencies", ((Reflect.getMetadata("dependencies", _, d) as string[])?.push(K) ?? [K]), _));
    //         const getter = descriptor.get;// ?? descriptor.value;
    //         if (typeof getter !== "function")
    //             throw new TypeError(`Artefact.depends(): K=\"${K}\" dependencies=${dependencies/* .map(d => `\"${d}\"`).join(", ") */}: member with @depends should define a function or a getter, descriptor=${JSON.stringify(descriptor)}`);
    //         // (this as unknown as typeof Artefact).aspectGetters.set(_[K], getter);
    //         for (const dependency of dependencies) {
    //             const downstreams = Reflect.getMetadata("downstreams", _, dependency) as ArtefactDownstreams ?? {};
    //             // if (downstreams[K] !== getter) {
    //                 downstreams[K] = function getWrapper() {//getter;
    //                     if (this.aspects.has(K)) {
    //                         this.aspects.delete(K);
    //                     }
    //                     const valuePending = Promise.resolve(getter.apply(this));
    //                     this.aspectsPending[K] = valuePending;
    //                     valuePending.then(value => {
    //                         this.addAspect(value);
    //                         if (this.aspectsPending[K] === valuePending) {
    //                             delete this.aspectsPending[K];
    //                         }
    //                     });
    //                     return valuePending;
    //                 };//getter;//.push({ name: K, getter: getter/* .bind(this) */ });
    //                 Reflect.defineMetadata("downstreams", downstreams, _, dependency);
    //             // }
    //         }
    //     }
    // }
    // // static makeProxy
    // proxify<A extends Artefact, R = A>(artefactCtor: Ctor<A>) {
    //     return new Proxy(this, {
    //         get(_, K, receiver) {

    //         }
    //     });
    // }

    // toJSON<A extends Artefact>(this: A): { _id?: string; } & Record<string, any> {
    //     return ({
    //         _id: this._id,
    //         ...Object.fromEntries(
    //             Object.getOwnPropertyNames(this/* .constructor.prototype */)
    //             // Array.from(this.aspects.keys())
    //                 .filter(K => K !== "query")
    //                 .map(K => ([K, this[K]/* this.aspects.get(K) */])))
    //     });
    // }
    toString<A extends Artefact>(this: A) {
        return `[${this.constructor.name}: _id=${this._id ?? "(undefined)"} ${JSON.stringify(this/* .toJSON() */)} query=${JSON.stringify(this.query)}`;
    }

    // async createAspect<
    //     A extends Aspect,
    //     TCreateArgs extends AnyParameters = Parameters<AspectCtor<A>["create"]>
    // >(aspectCreator: AspectCtor<A>, ...args: TCreateArgs) {
    //     console.log(`createAspect: aspectCreator.name=${aspectCreator.name}, args=${args}`);
    //     const aspect = await aspectCreator.create(...[args[0], ...args.slice(1)]);
    //     this.addAspect(aspect);
    //     return aspect;
    // }
    // addAspect<A extends Aspect>(aspect?: A, aspectCtor?: AspectPossiblyAbstractCtor<A>) {
    //     console.log(`addAspect 1: aspect=${aspect}, aspectCreator.name=${aspectCtor?.name}, aspect?.constructor=${(aspect?.constructor as AspectPossiblyAbstractCtor<A>)?.name}`);
    //     if (!aspect) {
    //         if (!!aspectCtor) {
    //             this.aspects.delete(aspectCtor.name);
    //         }
    //         else throw new TypeError(`addAspect(): aspect == null && aspectCtor == null`)
    //     } else {
    //         aspectCtor ??= aspect.constructor as AspectPossiblyAbstractCtor<A>;
    //         this.aspects.set(aspectCtor.name /* ?? aspect?.constructor as AspectPossiblyAbstractCtor<A> */, aspect);
    //         const downstreams = (Reflect.getMetadata("downstreams", this, aspectCtor.name) ?? {}) as ArtefactDownstreams;
    //         for (const downstream in downstreams) {
    //             if (this.aspects.has(downstream)) {
    //                 this.aspects.delete(downstream);
    //                 const value = this[downstream];
    //             }
    //         }
    //         aspect.onAddedToArtefact(this);
    //     }
    //     return this;
    // }
    // getAspect<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>) {
    //     console.log(`getAspect: aspectCtor.name=${aspectCtor.name}`);
    //     return this.aspects.get(aspectCtor.name) as A | undefined;
    // }

    /* async*  */toData<A extends Artefact>()/* : AsyncGenerator<Timestamped<Partial<ArtefactDataProperties<A>>>, Timestamped<Partial<ArtefactDataProperties<A>>>, undefined> */ {
        console.log(`toData: this=${this}`);2
        return filterObject(mapObject(this, 
            ([K, V]) => ([K, typeof V === "function" ? V(this, undefined) : V])),
            ([K, V]) => !isPromise(V));
        //         /* .map */(([K, V]) => ([K, " fuck off cunt"])));
                //     !!V.get ? V.get.call(this) :
                //     !!V.value ? typeof V.value === 'function' ? V.value.call(this) : V.value
                //     : undefined
                // ])));
    }
    // async toDataPending<A extends Artefact>(): Promise<Timestamped<Partial<ArtefactDataProperties<A>>>> {
    //     return await pProps({ ...this.aspectsPending }).then(result => ({ ...result, ...pProps(this.aspectsPending) }));
    //     // const dataOnly = dataAndUpdates;//filterObject(dataAndUpdates, (([K, V]) => typeof V !== "function"));
    //     // console.log(`toData(): dataUpdates = ${JSON.stringify(dataAndUpdates)} dataOnly=${JSON.stringify(dataOnly)}`);
    //     // yield { ...dataAndUpdates as Timestamped<Partial<ArtefactDataProperties<A>>>, _ts: new Date() };
    //     // const result = { ...await pProps(dataAndUpdates), _ts: new Date() };
    //     // console.log(`toData(): result = ${JSON.stringify(result)}`);
    //     // yield { ...result as Timestamped<Partial<ArtefactDataProperties<A>>>, _ts: new Date() };
    //     // return result;
    // }
    // static addAspectType<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>, dependencies: Array<AspectPossiblyAbstractCtor<Aspect>>) {
    //     this.#aspectTypes.set(aspectCtor, dependencies);
    // }
    // static getAspectType<A extends Aspect>(aspectCtor: AspectPossiblyAbstractCtor<A>) {
    //     return this.#aspectTypes.get(aspectCtor);
    // }
    // static getAspectTypes() {
    //     return this.#aspectTypes;
    // }
    // static Type<A extends Artefact>(name: string, artefactType: { [K: string]: typeof Aspect } /* | ((this: A) => any) ArtefactCtor<A> */) {
    //     const C = class extends Artefact {};
    //     Object.defineProperty(C, "name", name);
    //     for (const K in artefactType) {
    //         const artefactProp = artefactType[K];
    //         Object.defineProperty(C.prototype, K, {
    //             configurable: true,
    //             enumerable: true,
    //             // get: Aspect.isPrototypeOf(artefactType[K]) ?
    //                 get: function getter(this: Artefact) { return this.getAspect(artefactProp as typeof Aspect); }// :
    //                 // artefactProp as ((this: A) => any)
    //                 // function getter(this: Artefact) {
    //                 //     const cachedValue = this.getAspect(artefactType[K] as typeof Aspect);
    //                 //     // otherwise call getter and addAspect new value for caching
    //                 // }
    //         });
    //     }
    //     return C;
    // }

    // does this fn need a this parameter to construct derived classes with new this() ? or not.. check..
    static async* stream<S extends Aspect, A extends Artefact>(this: ArtefactCtor<A>, source: AsyncIterable<S>, selector?: (_: A, s: S) => void) {
        console.log(`stream: this.name=${this.name}`);
        for await (const aspect of source) {
            console.log(`stream: aspect=${aspect} this.length=${this.length}`);
            let _;
            if (this.length === 1) {
                _ = new (this as ArtefactCtor<A, [S]>)(aspect);
            } else {
                _ = new this();
                selector?.(_, aspect)/*  ?? _.addAspect(aspect) */;
            }
            yield _;
        }
    }

    get query(): Queries<Artefact> {
        return ({
            unique: !this._id ? undefined : ({ _id: { $eq: this._id } }),
        });
    }
}