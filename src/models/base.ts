import { Collection, Filter, FindOptions, InferIdType, UUID } from "mongodb";
import { Store } from "../db";
import * as zod from "zod";

export type NonMethodKeys<T> = { [P in keyof T]: T[P] extends () => void ? never : P; }[keyof T];
export type DataProperties<T> = Pick<T, NonMethodKeys<T>>; 

export interface ClassConstructor<TClass, TCtorArgs extends Array<any> = [DataProperties<TClass>]> {
    new (...args: TCtorArgs): TClass;
};

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export class Timestamp {
    public created: Date;
    public updated: Date;
    public modified: Date;
    constructor() {
        this.created = new Date();
        this.updated = this.created;
        this.modified = this.updated;
    }
}

export class ModelTimestampTree {
    [K: string]: Timestamp | ModelTimestampTree;
}

export class TimeStampedValue<TValue, TValueGetter = () => Promise<TValue>> {

    value?: TValue;
    version: number;
    mTimeMs: number;
    
    constructor(value?: TValue) {
        this.value = value;
        this.version = this.value === undefined ? 0 : 1;
        this.mTimeMs = Date.now();
    }

    get timestamp(): Date {
        return new Date(this.mTimeMs);
    }

    valueOf(): TValue | undefined { return this.value; }
};

const n = new TimeStampedValue<Number>();

export type TimeStampedHash = TimeStampedValue<string>;

// export function Model<TSchema>(modelClass: ClassConstructor<TSchema>, store: Store) {
// Model.create<File>({ path: "" })
// export interface Model<TModel extends Model<TModel>> {
//     public _id?: string;// InferIdType<this>;
//     public _ts?: Timestamp;
//     constructor: ModelStatic<TModel>;
//     static abstract create<TModel extends Model<TModel>>(): void;
// }

const 
const Model = zod.object({
    _id: zod.string().optional();
    _ts: 
})
export abstract class Model<TModel extends Model<TModel>> {

    public _id?: string;// InferIdType<this>;
    public _ts?: ModelTimestampTree;// Timestamp;
    
    get isNew() { return this._id === null; }

    constructor(data?: DataProperties<Model<TModel>>): Model<TModel> {
        this._id = data?._id ?? undefined;
        this._ts = data?._ts ?? new Timestamp();
    }

};

// export interface ModelStatic<TModel extends Model<TModel>> {
//     new (...args: any[]): Model<TModel>;
//     async create<TModel extends Model<TModel>>(): Promise<TModel | null>;
//     prototype: TModel;
//  };
     //     ,
    //     TAsyncCreator extends new () => TModel, //({ path }: { path: string }) => Promise<TModel>,
    //     // TModel = TAsyncCreator extends ({ path }: { path: string }) => Promise<infer TModel> ? ReturnType<TAsyncCreator> : never
    // >(
    //     { path }: { path: string }
    // ) {
    //     return await new typeof TAsyncCreator()
    // }
}

    // static WrapCollection<TSchema extends Model<TSchema>>(collection: Collection<Model<TSchema>>, ctor: ClassConstructor<DataProperties<Model<TSchema>>>) {
    //     return Object.assign(collection, {
    //         find(...args: Parameters<typeof collection.find>) {
    //             return collection.find(...args).map(doc => new ctor(doc));
    //         },
    //         async findOne(...args: Parameters<typeof collection.findOne>) {
    //             const doc = await collection.findOne(...args);
    //             return doc ? new ctor(doc) : null;
    //         },
    //         async updateOne(...args: Parameters<typeof collection.updateOne>) {
    //             const result = await collection.updateOne(...args);
    //         }
    //     })
    // }
