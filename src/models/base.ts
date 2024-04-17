import { Collection, Filter, FindOptions, InferIdType, UUID, UpdateFilter } from "mongodb";
import { Store } from "../db";
import * as nodePath from 'path';

// export type NonMethodKeys<T> = { [P in keyof T]: T[P] extends () => void ? never : P; }[keyof T];
export type DataProperties<T> = { [P in keyof T]: T[P] extends (...args: any[]) => any ? never : T[P]; };//Pick<T, NonMethodKeys<T>>; 

export interface ClassConstructor<TClass, TCtorArgs extends Array<any> = [TClass]> {
    new (...args: TCtorArgs): Model<TClass>;
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

// const 
// const Model = zod.object({
//     _id: zod.string().optional();
//     _ts: 
// })


function copyProperties<T, K extends keyof DataProperties<T>>(s: Pick<T, K>, d: T, ks: K[]) {
    ks.forEach(k => d[k] = s[k]);
    return d;
}

export interface UpdateOrCreateOptions {
};
export var UpdateOrCreateOptions: {
    default: UpdateOrCreateOptions;
} = {
    default: {},
};

export interface IModel {
    _T: string;
    _id?: string;// InferIdType<this>;
    _ts?: Timestamp;
}

export abstract class Model<TModel> {

    public _T: string;
    public _id?: string;// InferIdType<this>;
    public _ts?: Timestamp;
    
    get isNew() { return this._id === null; }
    
    constructor(modelCtor: ClassConstructor<TModel>, data?: IModel) {
        this._T = modelCtor.name;
        this._id = data?._id ?? undefined;
        this._ts = data?._ts ?? new Timestamp();
    }

    static Type<TModel extends Model<TModel>>(query: Partial<TModel>) {
        return {
            [this.name]: query,
        };
    }
    //         findOne: (query: Document): { [K: string]: Document } => ({ [this._T]: query }),
    //     };
    // }

    toData(): IModel {
        return ({ ...this }) as IModel;
    }

    toArtefact() {
        return {
            [this._T]: this.toData,
        }
    }
    query = {
        findOne: (): UpdateFilter<TModel> => ({ _id: this._id }),
    };

    // async updateOrCreate(store: Store<TModel>, options?: UpdateOrCreateOptions): Promise<void> {};

    update(newData: TModel): string[] {
        const prevData = { ...this };
        const updated = (function checkUpdateValues(prev: any, next: any): string[] {
            const updated: string[] = [];
            for (const key of Object.keys(prev)) {
                if (typeof prev[key] === 'object') {
                    const updatedChildren = checkUpdateValues(prev[key], next[key]);
                    if (updatedChildren.length > 0) {
                        updated.push(...updatedChildren.map(childKey => key + "." + childKey));
                        updated.push(key);
                    }
                }
                else {
                    if (prev[key] !== next[key])
                        updated.push(key);
                }
            }
            return updated;
        })(prevData, newData);
        return updated;
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
// }

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
