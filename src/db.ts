import * as mongo from 'mongodb';
import { ClassConstructor, DataProperties, IModel, Model } from './models/base';
import { Filter, FindCursor, UpdateFilter, UpdateOptions, WithoutId } from 'mongodb';
import { ToString } from 'yargs';

let client: mongo.MongoClient | null = null;
let connection: mongo.MongoClient;
let db: mongo.Db;

export function isConnected() {
    return client !== null;
}

export async function connect(url: string, options?: mongo.MongoClientOptions) {
    if (client === null) {
        process.stdout.write(`Initialising DB connection to ${url} ${options !== undefined ? ("options=" + JSON.stringify(options)) : "" } ... `);
        client = new mongo.MongoClient(url, options);
        connection = await client.connect();
        db = connection.db();
        process.stdout.write("OK\n");
    }
    return connection;
}

export async function close() {
    if (client !== null) {
        process.stdout.write(`Closing DB connection ... `);
        await connection.close();
        client = null;
        process.stdout.write("OK\n");
    }
}

export async function useConnection(url: string, options: mongo.MongoClientOptions = {}, command: (db: mongo.MongoClient) => Promise<void>) {
    await connect(url, options);
    try {
        await command(connection);
    } catch (err) {
        throw err;
    } finally {
        await close();
    }
}

export interface Store<
    TSchema extends { [K: string]: Partial<Model<TModel>> },
    TModel extends Partial<Model<TModel>>
> {
    find(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<FindCursor<{ [K: string]: Model<TModel> }>>;
    findOne(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<{ [K: string]: Model<TModel> } | null>;
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options?: mongo.FindOneAndUpdateOptions): Promise<mongo.WithId<TSchema> | null>;
};

export class Store<
    TSchema extends { [K: string]: Partial<Model<TModel>> },
    TModel extends Partial<Model<TModel>>
> {
    private _collection: mongo.Collection<TSchema>;
    private _modelClasses: { [K in keyof TSchema]: ClassConstructor<TSchema[K]> };

    constructor(name: string, modelClasses: { [K in keyof TSchema]: ClassConstructor<TSchema[K]> }) {
        this._collection = db.collection<TSchema>(name, {});
        this._modelClasses = modelClasses;//new Map(Object.entries(modelClasses)); // .map(([K, ctor]) => ([ctor.name, ctor]) )
    }

    async find(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<FindCursor<{ [K: string]: Model<TModel> }>> {
        return this._collection.find<TSchema>(filter, options).map(doc => Object.fromEntries(Object.keys(doc).map(K => ([K, new (this._modelClasses as any)[K]((doc as any)[K])]))));
    }

    async findOne(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<{ [K: string]: Model<TModel> } | null> {
        const doc = await this._collection.findOne<TSchema>(filter, options);
        return doc !== null ? Object.fromEntries(Object.keys(doc).map(K => ([K, new (this._modelClasses as any)[K]((doc as any)[K])]))) : null;
    }

    async updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options?: mongo.FindOneAndUpdateOptions): Promise<mongo.WithId<TSchema> | null> {
        return await this._collection.findOneAndUpdate(filter, update, options ?? {});
    }
    
    async updateOrCreate(instance: Partial<TSchema>, findOneQuery: { [K: string]: Partial<TSchema[typeof K]> }) {
        
    }
}
