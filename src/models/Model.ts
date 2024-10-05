import { Store } from "../db";
import { Filter } from "mongodb";
import { is } from "./types";

export const isFunction = (value: any): value is Function => typeof value === 'function';
export const isAsyncIterable = <T>(obj: any): obj is AsyncIterable<T> => obj.hasOwnProperty(Symbol.asyncIterator);
export const isIterable = <T>(obj: any): obj is Iterable<T> => obj.hasOwnProperty(Symbol.iterator);

export type DataPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];
export type DataProperties<T> = Pick<T, DataPropertyNames<T>>;

export type ClassConstructor<T = any, TCtorArgs extends Array<any> = Array<any>> = (new (...args: TCtorArgs) => T);
export type AbstractConstructor<T> = {
    name: string;
    prototype: T;
};

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

// export type ObjectMapFunction = ([K, V]: [string, any]) => ([string, any]);
// export function mapObject(source: {}, mapFn: ObjectMapFunction | undefined): {} {
//     return Object.fromEntries<any>(
//         (isMap(source) ? Array.from(source.entries()) : Object.entries(source))
//             .filter<[string, any]>(([K, V]: [string, any]) => typeof K === 'string' && typeof V !== 'function')
//             .map(mapFn ?? (([K, V]: [string, any]) => ([
//                 K,
//                 V !== null && typeof V === 'object' ?
//                     mapObject(V, mapFn) :
//                     V
//             ])))
//     );
// };

// function mapObject(object, fn) {
//     return Object.entries(object)
//         .reduce((carry, [key, value], index, array) => {
//             carry[key] = fn(value, key, array)
//             return carry
//         }, {})
// }

export class Timestamps {
    created: Date;
    updated: Date;
    modified: Date;
    constructor(timestamps?: Timestamps) {
        if (timestamps !== undefined) {
            this.created = timestamps.created;
            this.updated = timestamps.updated;
            this.modified = timestamps.modified;
        } else {
            this.created = new Date();
            this.updated = this.created;
            this.modified = this.created;
        }
    }
};

export class ModelMeta<A extends Artefact = Artefact> {

    a: A;
    ts: Timestamps;

    unique: Array<string>;
    depend: Map<string, string[]>;

    pending: Array<Promise<any>>;

    constructor(meta: ModelMetaInit<A>) {
        this.a = meta.a;
        this.ts = new Timestamps(meta.ts);
        this.unique = [];
        this.depend = new Map();
        this.pending = [];
    }

    queueTask(task: Promise<any> | (() => Promise<any>)) {
        this.pending.push(isFunction(task) ? task() : task);
    }
};

export type ModelMetaInit<A extends Artefact = Artefact> =
    Required<Pick<ModelMeta<A>, 'a'>> &
    Partial<Pick<ModelMeta<A>, 'ts'>>;

export type ModelProperties<T> = Omit<DataProperties<T>, '_'>;
export type ModelConstructor<M extends Model = Model> = ClassConstructor<M, [ModelProperties<M>]>;
export type AbstractModelConstructor<M extends Model = Model> = AbstractConstructor<M>;

export type ModelQueries<M extends Model = Model> = {
    // [K: string]: (...args: any[]) => Filter<M>;
    get byPrimary(): Filter<M>,
};

export default abstract class Model {
    
    _!: ModelMeta;
    // queueTask(task: Promise<any> | (() => Promise<any>)) {
    //     this._.queueTask(task);
    // }

    static query: ModelQueries<Model> = {
        byPrimary: () => { throw new TypeError(`Model '${this.name}' does not provide a query.byPrimary`); },
    }

    // static buildModelQueries<
    //     MCtor extends typeof Model,
    //     M extends InstanceType<MCtor> = InstanceType<MCtor>,
    // >(this: MCtor, queries: ModelQueries<M>/* Q */) {     /*< M extends typeof Model *//* Q extends ModelQueries >*/
    //     const modelName = this.name;
    //     const prefix = (query: Filter<M>): Filter<Artefact> =>
    //         Object.fromEntries(Object.entries(query).map(([K, V]) =>
    //             ([ (K.startsWith('$') ? K : `${modelName}.${K}`) as string, V ])));
    //     return Object.fromEntries(Object.entries(queries).map(([K, V]) =>
    //         ([K, (...args: any[]) => prefix(V(...args))])));
    // }

    // decorators for specifying model indexes
    static Index = {
        unique(target: Model, propertyKey: string): void {
            target._.unique.push(propertyKey);
        },
    }

    // decorators for specifying model data attributes and behaviour
    static Data = {
        depend(...dependencies: string[]) {
            return function (target: Model, propertyKey: string) {
                target._.depend.set(propertyKey, Array.from(dependencies));
            };
        },
    }
    
};

export type ModelStatic = {
    name: string;
};

export type ModelInit<T> = Partial<T> & {
    _: ModelMeta;
};

export type ArtefactData<T = Model> = {
    [K: string]: T | undefined;
};

export type OptionalId<T extends ArtefactData = ArtefactData> = {
    _id?: string
} & T;

export type ArtefactModelConstructors = {
    [K: string]: new (data: DataProperties<Model>) => Model;
};

export type ArtefactQueries<A extends Artefact = Artefact> = {
    readonly [K: string]: Filter<A> | undefined;
};

export class Artefact {

    static newId = (): string => crypto.randomUUID();
    _id?: string;
    get isNew(): boolean { return this._id === undefined; }

    getKey() { return ({ "_id": { "$eq": this._id } }); }

    private _modelMap = new Map<ModelConstructor | AbstractModelConstructor, Model>;

    constructor(artefactData?: Iterable<Model> | Model) {
        if (artefactData !== undefined) {
            if (isIterable(artefactData)) {
                for (const modelData of artefactData) {
                    if (modelData !== undefined) {
                        this.add(modelData);
                    }
                }
            } else {
                this.add(artefactData);
            }
        }
    }

    static createFromModel<
        M extends Model,
        A extends Artefact,
        ACtor extends ClassConstructor<A, [Iterable<Model>?]> = typeof this,
        >(
        this: ACtor,
            modelData: M
        ) {
        return new this().add<A, M>(modelData);
    }

    add<A extends Artefact, M extends Model = Model>(this: A, model: M) {
        model._ ??= new ModelMeta({ a: this });
        model._.a = this;
        this._modelMap.set(model.constructor, model);
        return this;
    }

    get<M extends Model>(modelCtor: ModelConstructor<M> | AbstractModelConstructor<M>) {
        return this._modelMap.get(modelCtor) as M | undefined;
    }

    has<M extends Model>(modelCtor: ModelConstructor<M> | AbstractModelConstructor<M>) {
        return this._modelMap.has(modelCtor);
    }

    static async* stream<
        A extends Artefact,
        M extends Model
    >(
        this: ClassConstructor<A>,
        iterable: AsyncGenerator<M>
    ) {
        for await (const model of iterable) {
            yield new this([model]) as A;
        }
    }

    toData(options?: any) {
        return ({
            _id: this._id,
            ...Object.fromEntries(
                Array.from(
                    this._modelMap.entries()
                ).map(([ctor, value]) => ([
                    ctor.name, this.get(ctor)
                ]))
            ),
        });
    }

    async save<A extends Artefact>(this: A, db: Store<A>) {
        if (this.isNew) {
            this._id = Artefact.newId();
        }
        await db.updateOrCreate(this);
        return this;
    }

    /* todo: query objects */
    static query = {
        byId: (id: string | undefined) => ({ _id: id }),            // Use this when you definitely only want to use the _id (and it exists i.e. this.isNew === false)
        // byPrimary: () => { throw new TypeError(`Artefact type '${this.name}' does not provide a query.byPrimary`); },
    }

    get query(): ArtefactQueries {
        return ({
            byId: Artefact.query.byId(this._id),
            byIdOrPrimary: this._id !== undefined ? this.query.byId : this.query.byPrimary,
            // byPrimary() { throw new TypeError(`Artefact type '${this.constructor.name}' does not provide a query.byPrimary`); },
        });
    }
};

export const isArtefact = is(Artefact);

// export const makeArtefactType = (models: { [K: string]: new (...args: any[]) => Model; }, keyFn: (data: ArtefactData) => string) => {
export function makeArtefactType(models: ModelConstructor[]) {

    return class ArtefactTyped extends Artefact {

        static async load<A extends Artefact>(store: Store<A>, query: Filter<A>) {
            const artefactData = await store.findOne(query) || {};
            return new this(
                Object.entries(artefactData as ArtefactData)
                    .filter(([K, V]) => Object.hasOwn(models, K))
                    .map(([K, V]) => new (models.find(ctor => ctor.name === K))!(V as Model))
            );
        }

    };

}
