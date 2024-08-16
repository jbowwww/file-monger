import { ClassConstructor } from "./base";
import { Storage, Store } from "../db";
import { Filter } from "mongodb";
import { objectMap, objectMapToProperties } from "./types";
import { Primitive } from "zod";

export type DataProperties<T> = { [P in keyof T]: T[P] extends () => void ? never : T[P]; };//Pick<T, NonMethodKeys<T>>; 

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
}

export class ModelMeta {
    a: Artefact;
    ts: Timestamps;
    constructor(meta: ModelMetaInit) {
        this.a = meta.a;
        this.ts = new Timestamps(meta.ts);
    }
};

export type ModelMetaInit = Required<Pick<ModelMeta, 'a'>> & Partial<Pick<ModelMeta, 'ts'>>;

export type ModelConstructor = new(...args: any[]) => Model;
export type AbstractModelConstructor = abstract new(...args: any[]) => Model;

export function isModelConstructor(value: any): value is ModelConstructor {
    return (
        typeof value === 'function' &&
        typeof value.name === 'string' &&
        typeof value.prototype === 'object' &&
        value.prototype.constructor === value
    );
}
export default class Model {
    get _type(): string { return this.constructor.name; }
    // maybe no model on id?? Artefact can have an _id and be responsible for running queries. 
    // And at that level Artefact could probably select which of its member model(s) to include
    // in the query return

    // already have a .name( ) which static on the Model class function/ctor(>!)

    // do i even need a constructor without having any fields or props to init?

    // there WILL (?) be some static fn's or getters to return query objects for the Artefact (this._A again?)
    // ok so i should have a constructor or what ..
    // nah just set model(aka this)._A from the Artefact when it is creating Model isntances
    // oh but ok that's a prop.
    _!: ModelMeta;
    static buildModelQueries<Q extends { [K : keyof Q]: (...args: any[]) => Filter<Model>; }>(queries: Q) {
        const modelName = this.name;
        const prefix = (query: Filter<Model>) =>
            Object.fromEntries(Object.entries(query).map(([K, V]: [string, (...args: any[]) => Filter<Model>]) =>
                ([K.startsWith('$') ? K : `${modelName}.${K}`, V]))) as Filter<Artefact>;
        return Object.fromEntries(Object.entries<(...args: any[]) => Filter<Model>>(queries).map(([K, V]) =>   //: ([keyof Q, (...args: Parameters<Q[K]>) => Filter<Model>])
            ([K, (...args: any[]) => prefix(V(...args))])));
    }
    static query = this.buildModelQueries({});
    // getQuery: (m: Model) => Filter<Model>) {
    //     return ({ [this.constructor.name]: getQuery() })
    // };

    // new(): ModelConstructor;
};

export type ModelStatic = {
    name: string;
}

export type ModelInit<T> = Partial<T> & {
    _: ModelMeta;
};

export type ArtefactData = {
    [K: string]: Model;
};

export type ArtefactViewSchema = {
    [K: string]: ModelConstructor | AbstractModelConstructor | ArtefactViewSchema | Primitive;
};

export type ArtefactViewData = {_id?: string; } & {
    [K: string]: Model | undefined | Omit<ArtefactViewData, "_id">;
};

export type ArtefactView = (a: Artefact) => ArtefactViewData;

export const makeArtefactView = (viewSchema: ArtefactViewSchema): ArtefactView =>
    ((a: Artefact): ArtefactViewData => ({
        _id: a._id,
        ...objectMapToProperties(viewSchema, ([K, V]) => ([K, {
            enumerable: true,
            get: isModelConstructor(V) ?
                () => a.get(V) :
                () => makeArtefactView(V as ArtefactViewSchema)(a)
        }])) as ArtefactViewData
    }));

export type OptionalId<T extends ArtefactViewSchema> = T & {
    _id?: string
};

// export type ArtefactModels<TArtefact extends Artefact> = {
//     [K in keyof TArtefact]: TArtefact[K] extends Model ? TArtefact[K] : never;
// };

export type ArtefactModelConstructors = {
    [K: string]: new (data: DataProperties<Model>) => Model;
};

export type QueryBuilderFunction<A extends Artefact> = (a: A) => Filter<A>;

// export const makeArtefactType = (models: { [K: string]: new (...args: any[]) => Model; }, keyFn: (data: ArtefactData) => string) => {

export class Artefact {

    static newId = () => crypto.randomUUID();
    _id?: string;
    get isNew(): boolean { return this._id === undefined; }

    getKey(): Filter<Artefact> { return ({ _id: this._id }); }
    private modelMap = new Map<ModelConstructor | AbstractModelConstructor, Model>;

    constructor(artefactData?: Iterable<Model>) {
        if (artefactData !== undefined) {
            for (const modelData of artefactData) {
                if (modelData !== undefined) {
                    this.add(modelData);
                }
            }
        }
    }

    static createFromModel(model: Model): Artefact {
        return new Artefact([model]); //{ [model.constructor.name]: model } as A);
    }

    add<M extends Model>(model: M) {
        model._ ??= new ModelMeta({ a: this });
        model._.a = this;
        this.modelMap.set(model.constructor as ModelConstructor, model);
    }

    get<M extends Model>(modelCtor: (new (...args: any[]) => M) | (abstract new (...args: any[]) => M)) {
        return this.modelMap.get(modelCtor as ModelConstructor | AbstractModelConstructor) as M | undefined;//modelCtor.name);
    }

    static async* stream<M extends Model>(this: typeof Artefact, iterable: AsyncGenerator<M>) {
        for await (const model of iterable) {
            yield Artefact.createFromModel(model) as Artefact;
        }
    }

    toData<V extends ArtefactViewSchema>(artefactView: V, options?: any): OptionalId<V> {
        return ({ _id: this._id, ...Object.fromEntries(this.modelMap.entries()) as V });
    }

    async save<TSchema extends Artefact>(db: Store<TSchema>) {
        if (this.isNew) {
            this._id = Artefact.newId();
        }
        const view = makeArtefactView(Object.fromEntries(Array.from(this.modelMap.keys()).map(modelCtor => ([modelCtor.name.toLowerCase(), modelCtor]))));
        const data = view(this);
        await db.updateOrCreate(this);
        return data;
    }

    static async load<A extends ArtefactData>(db: Store<A>, query: Filter<A>) {
        const artefactData = await db.findOne(query) || undefined;
        return new Artefact(artefactData);
    }

    /* todo: query objects */
    query(qbFunc: QueryBuilderFunction<A>) {
        return qbFunc(this);
    }

    // = {
    //     findOne<T extends { _id?: string }>({ _id }: { _id?: string }) { return _id !== undefined ? ({ _id }) : ({}); },
    //     find<T extends { _id?: string }>() { },
    //     updateOne<T extends { _id?: string }>() { },
    //     update<T extends { _id?: string }>() { },
    // }

}
