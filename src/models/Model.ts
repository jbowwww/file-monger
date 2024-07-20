import { UUID } from "crypto";
import { ClassConstructor } from "./base";

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

export type Model<T> = T & {
    // maybe no model on id?? Artefact can have an _id and be responsible for running queries. 
    // And at that level Artefact could probably select which of its member model(s) to include
    // in the query return

    // already have a .name( ) which static on the Model class function/ctor(>!)

    // do i even need a constructor without having any fields or props to init?

     // there WILL (?) be some static fn's or getters to return query objects for the Artefact (this._A again?)
     // ok so i should have a constructor or what ..
     // nah just set model(aka this)._A from the Artefact when it is creating Model isntances
     // oh but ok that's a prop.
     _: ModelMeta;
};

export type ModelInit<T> = Partial<T> & {
    _: ModelMeta;
};

export class Artefact {

    _id?: string;
    get isNew(): boolean { return this._id === undefined; }
    // private set isNew(value: boolean) { this.isNew}
    static newId = () => crypto.randomUUID();

    // private modelMap = new Map<string, Model>;
    
    // constructor(private models: { [K: string]: Model }) {
    //     for (const modelName in models) {
    //         this.add(models[modelName]);
    //     }
    // }

    add<TModel>(modelCtor: new (...args: any[]) => any, modelData?: ModelInit<TModel>) {
        const model = Object.assign(
            new modelCtor(modelData ?? {}),
            { _: new ModelMeta({ ...(modelData?._ ?? {}), a: this }) }
        ) as TModel;
        // this.modelMap.set(model.constructor.name, model);
    }

    static async* stream(iterable: AsyncGenerator<Model>) {
        for await (const model of iterable) {
            yield new Artefact({ [model.constructor.name]: model });
        }
    }

    async save(db: Storage) {
        if (this.isNew) {
            this._id = Artefact.newId();
        }
        await db.save(this);
    }

    async load(db: Storage) {
        Object.assign(await db.load());
    }

    /* todo: query objects */
    static query = {
        findOne<T extends { _id?: string }>({ _id }: { _id?: string }) { return _id !== undefined ? ({ _id }) : ({}); },
        find<T extends { _id?: string }>() { },
        updateOne<T extends { _id?: string }>() { },
        update<T extends { _id?: string }>() { },

    }

}
