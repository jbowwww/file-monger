import { Store } from "../db";
import { Filter } from "mongodb";

export type DataProperties<T> = { [P in keyof T]: T[P] extends () => void ? never : T[P]; };

// export type ClassConstructor<TClass, TCtorArgs extends Array<any> = Array<any>> = {
//     new(...args: TCtorArgs): TClass;
//     prototype: TClass & {
//         constructor: ClassConstructor<TClass>,
//     }
// };

export type ClassConstructor<T, TCtorArgs extends Array<any> = Array<any>> = new (...args: TCtorArgs) => T;
export type AbstractConstructor<T, TCtorArgs extends Array<any> = Array<any>> = abstract new (...args: TCtorArgs) => T;
// export type AbstractConstructor<T> = ClassConstructor<T> & { prototype: T; };
// export type AbstractModelConstructor<M extends Model = Model> = {
//     new(...args: any[]): M;
// };

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export function mapObject<S extends object, T extends object>(source: S): T {
    return Object.fromEntries<S>(
        Object.entries(source)
            .filter(([K, V]) => typeof K !== 'symbol' && typeof V !== 'function')
            .map(([K, V]) => ([
                K,
                V !== null && typeof V === 'object' ?
                    mapObject(V) :
                    V
            ]))
    ) as T;
};

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

export class ModelMeta<TSchema extends Artefact = Artefact> {
    a: TSchema;
    ts: Timestamps;
    constructor(meta: ModelMetaInit<TSchema>) {
        this.a = meta.a;
        this.ts = new Timestamps(meta.ts);
    }
};

export type ModelMetaInit<TSchema extends Artefact = Artefact> =
    Required<Pick<ModelMeta<TSchema>, 'a'>> &
    Partial<Pick<ModelMeta<TSchema>, 'ts'>>;

export type ModelConstructor<M extends Model = Model> = ClassConstructor<M, [Partial<DataProperties<M>>]>;
export type AbstractModelConstructor<M extends Model = Model> = AbstractConstructor<M>;

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
    static buildModelQueries<Q extends { [K: string]: (...args: any[]) => Filter<Model>; }>(queries: Q) {
        const modelName = this.name;
        const prefix = (query: Filter<Model>) =>
            Object.fromEntries(Object.entries(query).map(([K, V]) =>
                ([K.startsWith('$') ? K : `${modelName}.${K}`, V])));
        return Object.fromEntries(Object.entries(queries).map(([K, V]) =>
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

// export type ArtefactModels<TArtefact extends Artefact> = {
//     [K in keyof TArtefact]: TArtefact[K] extends Model ? TArtefact[K] : never;
// };

export type ArtefactModelConstructors = {
    [K: string]: new (data: DataProperties<Model>) => Model;
};

// export type QueryBuilderFunction<A extends Artefact> = (a: A) => Filter<A>;

export class Artefact {

    static newId = (): string => crypto.randomUUID();
    _id?: string;
    get isNew(): boolean { return this._id === undefined; }

    getKey(): Filter<Artefact> { return ({ _id: this._id }); }

    private _modelMap = new Map<ModelConstructor | AbstractModelConstructor, Model>;

    constructor(artefactData?: Iterable<Model>) {
        if (artefactData !== undefined) {
            for (const modelData of artefactData) {
                if (modelData !== undefined) {
                    this.add(modelData);
                }
            }
        }
    }

    static {
        this.createFromModel = (<
            TSchema extends Artefact,
            TSchemaClass extends typeof Artefact,   //ClassConstructor<TSchema>,
            M extends Model
        >(
            this: ClassConstructor<TSchema>, //TSchemaClass,
            modelData: M
        ) {
            return (new this()).add<TSchema, M>(modelData);
        }).bind(this);
    }

    // static create<TSchema extends Artefact>(artefactData: { [K: string]: Model }) {

    // }

    add<TSchema extends Artefact, M extends Model = Model>(this: TSchema, model: M) {
        model._ ??= new ModelMeta({ a: this });
        model._.a = this;
        this._modelMap.set(model.constructor as ClassConstructor<M>, model);
        return this;
    }

    get<M extends Model>(modelCtor: ClassConstructor<M> | AbstractModelConstructor<M>) {
        return this._modelMap.get(modelCtor) as M | undefined;//modelCtor.name);
    }

    static async* stream<
        TSchema extends Artefact,
        TSchemaClass extends ClassConstructor<TSchema> & { prototype: TSchema }, //TSchemaClass,typeof Artefact,
        M extends Model
    >(
        this: TSchemaClass,
        iterable: AsyncGenerator<M>
    ) {
        for await (const model of iterable) {
            yield this.createFromModel<TSchema, TSchemaClass, M>(model);
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

    async save<TSchema extends Artefact>(this: TSchema, db: Store<TSchema>) {
        if (this.isNew) {
            this._id = Artefact.newId();
        }
        await db.updateOrCreate(this);
        return this;
    }

    /* todo: query objects */
    query = {
        byId: <TSchema extends Artefact>(): Filter<TSchema> => ({ _id: this._id } as Filter<TSchema>),
    }

    //     (qbFunc: QueryBuilderFunction<Artefact>) {
    // return qbFunc(this);

    static query = {
        byId: (a: Artefact) => ({ _id: a._id }),
    }
    // = {
    //     findOne<T extends { _id?: string }>({ _id }: { _id?: string }) { return _id !== undefined ? ({ _id }) : ({}); },
    //     find<T extends { _id?: string }>() { },
    //     updateOne<T extends { _id?: string }>() { },
    //     update<T extends { _id?: string }>() { },
    // }

};

// export const makeArtefactType = (models: { [K: string]: new (...args: any[]) => Model; }, keyFn: (data: ArtefactData) => string) => {
export function makeArtefactType(models: ModelConstructor[]) {

    return class ArtefactTyped extends Artefact {

        static async load<TSchema extends Artefact>(store: Store<TSchema>, query: Filter<TSchema>) {
            const artefactData = await store.findOne(query) || {};
            return new this(
                Object.entries(artefactData as ArtefactData)
                    .filter(([K, V]) => Object.hasOwn(models, K))
                    .map(([K, V]) => new (models.find(ctor => ctor.name === K))!(V as Model))
            );
        }

    };

}
