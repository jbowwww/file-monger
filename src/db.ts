import * as mongo from 'mongodb';
// import { ClassConstructor, DataProperties, IModel } from './models/base';
import { Filter, OptionalId, UpdateFilter, WithId } from 'mongodb';
import { Artefact, ArtefactData } from './models/Model';

export let client: mongo.MongoClient | null = null;
export let connection: mongo.MongoClient;
export let db: mongo.Db;

export let storage: Storage;

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

    private _client: mongo.MongoClient | null = null;
    private _connection: mongo.MongoClient | null = null;
    private _db: mongo.Db | null = null;

    constructor(public readonly url: string, public readonly options?: any) { }

    isConnected(): boolean {
        return this._client !== null;
    }

    async connect(): Promise<Storage> {
        if (this._client === null) {
            process.stdout.write(`Initialising DB connection to ${this.url} ${this.options !== undefined ? ("options=" + JSON.stringify(this.options)) : ""} ... `);
            this._client = new mongo.MongoClient(this.url, this.options);
            this._connection = await this._client.connect();
            this._db = this._connection.db();
            process.stdout.write("OK\n");
        }
        return this as Storage;
    }

    async close(): Promise<Storage> {
        await this.connect();
        process.stdout.write(`Closing DB connection ... `);
        await this._connection!.close();
        this._client = null;
        this._connection = null;
        this._db = null;
        process.stdout.write("OK\n");
        return this as Storage;
    }

    async store<TSchema extends Artefact>(name: string, options?: any): Promise<Store<TSchema>> {
        await this.connect();
        process.stdout.write(`Getting store '${name} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
        const store: Store<TSchema> = new MongoStore<TSchema>(this as Storage, name, options, this._db!.collection(name, options));
        process.stdout.write("OK\n");
        return store as Store<TSchema>;
    }

}

export interface Store<TSchema extends Artefact> {
    find(query: Filter<TSchema>): AsyncGenerator<WithId<TSchema>>;
    findOne(query: Filter<TSchema>): Promise<WithId<TSchema> | null>;
    findOneAndUpdate(query: Filter<TSchema>, update: TSchema): Promise<WithId<TSchema> | null>;
    updateOne(artefact: TSchema, query?: Filter<TSchema>): Promise<mongo.UpdateResult<TSchema> | null>;
    updateOrCreate(artefact: TSchema, query?: Filter<TSchema>): Promise<WithId<TSchema>>;
}

export class MongoStore<TSchema extends Artefact> implements Store<TSchema> {

    constructor(
        public readonly storage: Storage,
        public readonly name: string,
        public readonly options: any,
        private _collection: mongo.Collection<TSchema>, //mongo.Collection<ArtefactData>
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

    async updateOne(artefact: TSchema, query?: Filter<TSchema>, options: any = {}) {
        // if (query === undefined) {
        //     if (artefact._T.primary === undefined)
        //         throw new Error(`MongoStore.updateOrCreate(): artefact does not have a primary Model, so query parameter must be specified. artefact=${artefact}`);
        //     const primaryModelName = artefact._T.primary.name;
        //     query = { [primaryModelName]: artefact[primaryModelName].query } as any;
        // }
        const dbArtefact = await this._collection.updateOne(query!, { $set: artefact }, options);
        return dbArtefact;
    }

    async updateOrCreate(artefact: TSchema, query?: Filter<TSchema>, options: any = {}) {
        const data = artefact.toData();
        query ??= artefact.query.byIdOrPrimary();
        const dbArtefact = await this._collection.findOneAndUpdate(query, artefact.isNew ? {
            $set: artefact,
            // $setOnInsert: { },//artefact.isNew ? { _id: artefact._id = Artefact.newId(), } : undefined,
        } : {
            $set: artefact,
        }, { ...options, upsert: true });
        if (dbArtefact.value === null || dbArtefact.ok === 0) {
            throw new Error(`updateOrCreate: Error: dbArtefact=${dbArtefact} should not be null or have .ok===0, artefact=${artefact}, query=${query} options=${options}`)
        }
        return dbArtefact.value;
    }

}

export function isConnected() {
    return client !== null;
}

export async function connect(url: string, options?: mongo.MongoClientOptions) {
    if (client === null) {
        process.stdout.write(`Initialising DB connection to ${url} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
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
