import { ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, Db, Filter, FindOneAndReplaceOptions, FindOneAndUpdateOptions, MongoClient, MongoClientOptions, UpdateFilter, UpdateOptions, UpdateResult, WithId, WithoutId } from 'mongodb';
import { Artefact, ArtefactProperties } from './Model';

export let client: MongoClient | null = null;
export let connection: MongoClient;
export let db: Db;

export let storage: Storage;

export function isChangeInsert(value: ChangeStreamDocument): value is ChangeStreamInsertDocument {
    return value.operationType === "insert";
}
export function isChangeUpdate(value: ChangeStreamDocument): value is ChangeStreamUpdateDocument {
    return value.operationType === "update";
}

export type Timestamp = { _ts: Date; };

export interface Storage {
    isConnected(): boolean;
    connect(): Promise<Storage>;
    close(): Promise<Storage>;
    store<A extends Artefact, TSchema extends Timestamp = A & Timestamp>(name: string, options?: any): Promise<Store<A, TSchema>>;
}

export type StorageConfigurationFunction = () => Storage;
export type StorageCommandFunction = (storage: Storage) => Promise<void>

export function configure(config: StorageConfigurationFunction) {
    return storage = config();
}

export async function useStorage(command: StorageCommandFunction): Promise<void>;
export async function useStorage(config: StorageConfigurationFunction, command: StorageCommandFunction): Promise<void>;
export async function useStorage(
    commandOrConfig: StorageCommandFunction | StorageConfigurationFunction,
    commandOrConfig2?: StorageCommandFunction | StorageConfigurationFunction
): Promise<void> {
    const command = (commandOrConfig2 ?? commandOrConfig) as StorageCommandFunction;
    const config = (commandOrConfig2 ? commandOrConfig : undefined) as StorageConfigurationFunction | undefined;
    if (!storage) {
        if (!!config) {
            storage = configure(config);
        }
        if (!storage) {
            throw new RangeError("useStorage(): db.storage is undefined");
        }
    }
    await command(storage);
}

export class MongoStorage implements Storage {

    private _client: MongoClient | null = null;
    private _connection: MongoClient | null = null;
    private _db: Db | null = null;

    constructor(public readonly url: string, public readonly options?: any) { }

    isConnected(): boolean {
        return this._client !== null;
    }

    async connect(): Promise<Storage> {
        if (this._client === null) {
            process.stdout.write(`Initialising DB connection to ${this.url} ${this.options !== undefined ? ("options=" + JSON.stringify(this.options)) : ""} ... `);
            this._client = new MongoClient(this.url, this.options);
            this._connection = await this._client.connect();
            this._db = this._connection.db();
            process.stdout.write("OK\n");
        }
        return this as Storage;
    }

    async close(): Promise<Storage> {
        if (!!this._connection) {
            process.stdout.write(`close(): Closing DB connection ... `);
            await this._connection.close();
            this._client = null;
            this._connection = null;
            this._db = null;
            process.stdout.write("OK\n");
        } else {
            console.log(`close(): No DB connection to close`);
        }
        return this as Storage;
    }

    async store<A extends Artefact, TSchema extends Timestamp = A & Timestamp>(name: string, options?: any): Promise<Store<A, TSchema>> {
        await this.connect();
        process.stdout.write(`Getting store '${name} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
        const collection = this._db!.collection<TSchema>(name, options);
        const store: Store<A, TSchema> = new MongoStore<A, TSchema>(this as Storage, name, options, collection);
        process.stdout.write("OK\n");
        return store;
    }

}

export interface Store<A extends Artefact, TSchema extends Timestamp = A & Timestamp> {
    find(query: Filter<TSchema>): AsyncGenerator<WithId<TSchema>>;
    findOne(query: Filter<TSchema>): Promise<WithId<TSchema> | null>;
    findOneAndUpdate(query: Filter<TSchema>, update: TSchema): Promise<WithId<TSchema> | null>;
    updateOne(artefact: A, query?: Filter<TSchema>, options?: UpdateOptions): Promise<UpdateResult<TSchema> | null>;
    updateOrCreate(artefact: A, options?: FindOneAndReplaceOptions): Promise<WithId<TSchema>>;
}

export class MongoStore<A extends Artefact, TSchema extends Timestamp = A & Timestamp> implements Store<A, TSchema> {

    constructor(
        public readonly storage: Storage,
        public readonly name: string,
        public readonly options: any,
        private _collection: Collection<TSchema>,
    ) { }

    async* find(query: Filter<TSchema>) {
        for await (const item of this._collection.find(query))
            yield item;
    }

    async findOne(query: Filter<TSchema>) {
        return await this._collection.findOne(query);
    }

    async findOneAndUpdate(query: Filter<TSchema>, update: UpdateFilter<TSchema>) {
        return await this._collection.findOneAndUpdate(query, update);
    }

    async updateOne(artefact: A, query?: Filter<TSchema>, options: UpdateOptions = {}) {
        const { _id, _ts, ...data } = await artefact.toData();
        return await this._collection.updateOne(query!, { $set: data as Readonly<Partial<TSchema>> }, options);
    }

    async updateOrCreate(artefact: A, options: FindOneAndUpdateOptions = {}) {
        const query = (artefact.constructor as typeof Artefact).query(artefact).unique as Filter<TSchema>;
        options = { ...options, upsert: true, includeResultMetadata: true, returnDocument: 'after',  };
        const { _id, _ts, ...data } = await artefact.toData();
        const dbArtefact = await this._collection.findOneAndReplace(query, data as WithoutId<TSchema>, options);
        console.log(`updateOrCreate(): \n\tquery = ${JSON.stringify(query)}\n\toptions = ${JSON.stringify(options)}\n\tartefact = ${artefact}\n\tdata = ${JSON.stringify(data)}\n\tdbArtefact = ${JSON.stringify(dbArtefact)}`);
        if (dbArtefact === null) throw new Error(`updateOrCreate: Error: dbArtefact=${dbArtefact} should not be null artefact=${artefact}, query=${query} options=${options}`);
        return dbArtefact;
    }
}

export function isConnected() {
    return client !== null;
}

export async function connect(url: string, options?: MongoClientOptions) {
    if (client === null) {
        process.stdout.write(`Initialising DB connection to ${url} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
        client = new MongoClient(url, options);
        connection = await client.connect();
        db = connection.db();
        process.stdout.write("OK\n");
    }
    return connection;
}

export async function close() {
    if (!!connection) {
        process.stdout.write(`Closing DB connection ... `);
        await connection.close();
        client = null;
        process.stdout.write("OK\n");
    }
}

export async function useConnection(url: string, options: MongoClientOptions = {}, command: (db: MongoClient) => Promise<void>) {
    await connect(url, options);
    try {
        await command(connection);
    } catch (err) {
        throw err;
    } finally {
        await close();
    }
}
