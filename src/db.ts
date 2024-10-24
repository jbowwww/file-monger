import { ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, Db, Filter, MongoClient, MongoClientOptions, UpdateFilter, UpdateResult, WithId } from 'mongodb';
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

export function configure(config: () => Storage) {
    storage = config();
}

export interface Storage {
    isConnected(): boolean;
    connect(): Promise<Storage>;
    close(): Promise<Storage>;
    store<TSchema extends Artefact>(name: string, options?: any): Promise<Store<TSchema>>;
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

    async store<TSchema extends Artefact>(name: string, options?: any): Promise<Store<TSchema>> {
        await this.connect();
        process.stdout.write(`Getting store '${name} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
        const collection = this._db!.collection<ArtefactProperties<TSchema>>(name, options);
        const store: Store<TSchema> = new MongoStore<TSchema>(this as Storage, name, options, collection);
        process.stdout.write("OK\n");
        return store;
    }

}

export interface Store<TSchema extends Artefact> {
    find(query: Filter<ArtefactProperties<TSchema>>): AsyncGenerator<WithId<ArtefactProperties<TSchema>>>;
    findOne(query: Filter<ArtefactProperties<TSchema>>): Promise<WithId<ArtefactProperties<TSchema>> | null>;
    findOneAndUpdate(query: Filter<ArtefactProperties<TSchema>>, update: TSchema): Promise<WithId<ArtefactProperties<TSchema>> | null>;
    updateOne(artefact: TSchema, query?: Filter<ArtefactProperties<TSchema>>): Promise<UpdateResult<ArtefactProperties<TSchema>> | null>;
    updateOrCreate(artefact: TSchema): Promise<WithId<ArtefactProperties<TSchema>>>;
}

export class MongoStore<TSchema extends Artefact> implements Store<TSchema> {

    constructor(
        public readonly storage: Storage,
        public readonly name: string,
        public readonly options: any,
        private _collection: Collection<ArtefactProperties<TSchema>>,
    ) { }

    async* find(query: Filter<ArtefactProperties<TSchema>>) {
        for await (const item of this._collection.find(query))
            yield item;
    }

    async findOne(query: Filter<ArtefactProperties<TSchema>>) {
        return await this._collection.findOne(query);
    }

    async findOneAndUpdate(query: Filter<ArtefactProperties<TSchema>>, update: UpdateFilter<ArtefactProperties<TSchema>>) {
        return await this._collection.findOneAndUpdate(query, update);
    }

    async updateOne(artefact: TSchema, query?: Filter<ArtefactProperties<TSchema>>, options: any = {}) {
        const data = await artefact.toData();
        return await this._collection.updateOne(query!, { $set: data }, options);
    }

    async updateOrCreate(artefact: TSchema, options: any = {}) {
        console.log(`updateOrCreate(): artefact = ${JSON.stringify(artefact)}`);
        const query = artefact.query.unique as Filter<ArtefactProperties<TSchema>>;
        console.log(`updateOrCreate(): query = ${JSON.stringify(query)}`);
        options = { ...options, upsert: true, includeResultMetadata: true, returnDocument: 'after' };
        const data = await artefact.toData();
        console.log(`updateOrCreate(): \n\tquery = ${JSON.stringify(query)}\n\toptions = ${JSON.stringify(options)}\n\tartefact = ${JSON.stringify(artefact)}\n\tdata = ${JSON.stringify(data)}`);
        const result = await this._collection.findOneAndUpdate(query, { $set: data }, options);
        const dbArtefact = result.value;
        console.log(`updateOrCreate(): result = ${JSON.stringify(query)}`);
        if (dbArtefact === null || result.ok === 0) throw new Error(`updateOrCreate: Error: result=${result} should not be null or have .ok===0, artefact=${artefact}, query=${query} options=${options}`);
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
