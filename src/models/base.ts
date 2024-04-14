import { Collection, Filter, FindOptions, InferIdType, UUID } from "mongodb";
import { Store } from "../db";

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

// export function Model<TSchema>(modelClass: ClassConstructor<TSchema>, store: Store) {

export abstract class Model {
    public _id?: string;// InferIdType<this>;
    public _ts?: Timestamp;

    get isNew() { return this._id === null; }

    constructor(data?: DataProperties<Model>) {
        this._id = data?._id ?? undefined;
        this._ts = data?._ts ?? new Timestamp();
    }
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
