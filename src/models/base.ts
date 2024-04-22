import { Collection, Filter, FindOptions, InferIdType, UUID, UpdateFilter } from "mongodb";
import { Store } from "../db";
import * as nodePath from 'path';

// export type NonMethodKeys<T> = { [P in keyof T]: T[P] extends () => void ? never : P; }[keyof T];
export type DataProperties<T> = { [P in keyof T]: T[P] extends (...args: any[]) => any ? never : T[P]; };//Pick<T, NonMethodKeys<T>>; 

export interface ClassConstructor<TClass, TCtorArgs extends Array<any> = [TClass]> {
    new (...args: TCtorArgs): TClass;
};

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export class ModelTimestampTree {
    [K: string]: Timestamp | ModelTimestampTree;
}

export class Timestamp {
    public created: Date;
    public updated: Date;
    // public modified: Date;   // this doesn't make sense, means same as updated?
    // public? deleted: Date;    // might want this at some point?
    constructor() {
        this.created = new Date();
        this.updated = this.created;
        // this.modified = this.updated;
    }
}

// export function Model<TSchema>(modelClass: ClassConstructor<TSchema>, store: Store) {
// Model.create<File>({ path: "" })Model<
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

export interface ModelConstructor<
    TModel extends Model<TModel, TModelData>,
    TModelData extends IModel = DataProperties<TModel>,
    TRestArgs extends Array<any> = any[]
> {
    new (data: TModelData, ...args: TRestArgs): Model<TModel, TModelData>;
};


export interface IModel {
    readonly _id?: string;// InferIdType<this>;
    _ts?: Timestamp;
}

export abstract class Model<
    TModel extends Model<TModel, TModelData>,
    TModelData extends IModel = DataProperties<TModel>
> {

    public _T: ModelConstructor<TModel, TModelData>;
    public _id?: string;// InferIdType<this>;
    public _ts?: Timestamp;
    
    get isNew() { return this._id === null; }
    
    constructor(data?: TModelData) {            //modelCtor: ModelConstructor<TModel, TModelData>
        this._T = this.constructor as ModelConstructor<TModel, TModelData>;     //modelCtor;
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


export class Deleteable<
    TModel extends Model<TModel, TModelData>,
    TModelData extends IModel = DataProperties<TModel>
> extends Model<TModel, TModelData> {

    public isDeleted: boolean = false;

}

export class Timestamped<
    TModel extends Model<TModel, TModelData>,
    TModelData extends IModel = DataProperties<TModel>
> extends Model<TModel, TModelData> {

    public version: number = 1;
    public timeMs: number = Date.now();
    public get time(): Date { return new Date(this.timeMs); }

};

export class TimeStampedHistoricValue<TValue> extends Timestamped<TValue> {

}

const n = new Timestamped<Number>();

export type TimestampedHash = Timestamped<string>;



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
