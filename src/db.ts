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

export interface Store<TSchema extends Model<TSchema>> {
    find(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<FindCursor<TSchema>>;
    findOne(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<TSchema | null>;
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options?: mongo.FindOneAndUpdateOptions): Promise<mongo.UpdateResult<TSchema>>;
};

export class Store<TSchema extends Model<TSchema>> {
    private _collection: mongo.Collection<TSchema>;
    private _modelClass: ClassConstructor<TSchema>;

    constructor(modelClass: ClassConstructor<TSchema>, collectionName: string, options?: mongo.CollectionOptions) {
        this._collection = db.collection<TSchema>(collectionName, {});
        this._modelClass = modelClass;
    }

    async find(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<FindCursor<TSchema>> {
        return this._collection.find<TSchema>(filter, options).map(doc => new this._modelClass(doc));
    }

    async findOne(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<TSchema | null> {
        const doc = await this._collection.findOne<TSchema>(filter, options);
        return doc !== null ? new this._modelClass(doc) : null;
    }

    async updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options?: mongo.UpdateOptions): Promise<mongo.UpdateResult<TSchema>> {
        return await this._collection.updateOne(filter, update, options ?? {});
    } 
}
