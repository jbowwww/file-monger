import * as mongo from 'mongodb';
// import { ClassConstructor, DataProperties, IModel } from './models/base';
import { Filter, FindCursor, UpdateFilter, UpdateOptions, WithoutId } from 'mongodb';
import { ToString } from 'yargs';
import Model, { Artefact, ArtefactData } from './models/Model';
import { DbCommandArgv } from './cmds/db';

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
    store<TSchema extends ArtefactData>(name: string, options?: any): Promise<Store<Artefact<TSchema>>>;
}

export class MongoStorage implements Storage {

    private _client: mongo.MongoClient | null = null;
    private _connection: mongo.MongoClient | null = null;
    private _db: mongo.Db | null = null;

    constructor(public readonly url: string, public readonly options?: any) {}

    isConnected(): boolean {
        return this._client !== null;
    }
 
    async connect(): Promise<Storage> {
        if (this._client === null) {
            process.stdout.write(`Initialising DB connection to ${this.url} ${this.options !== undefined ? ("options=" + JSON.stringify(this.options)) : "" } ... `);
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

    async store<TSchema extends Artefact>(name: string, options?: any): Promise<Store<Artefact<TSchema>>> {
        await this.connect();
        process.stdout.write(`Getting store '${name} ${options !== undefined ? ("options=" + JSON.stringify(options)) : "" } ... `);
        const store: Store<TSchema> = new MongoStore<TSchema>(this as Storage, name, options, this._db!.collection(name, options));
        process.stdout.write("OK\n");
        return store as Store<TSchema>;
    }
}

export interface Store<TSchema extends Artefact> {
    find(query: Filter<TSchema>): AsyncGenerator<Artefact<TSchema>>;
    findOne(query: Filter<mongo.WithId<TSchema>>): Promise<Artefact<TSchema> | null>;
    findOneAndUpdate(query: Filter<TSchema>, update: TSchema): Promise<mongo.WithId<Artefact<TSchema>> | null>;
    updateOne(artefact: Artefact<TSchema>, query?: TSchema): Promise<mongo.UpdateResult<Artefact<TSchema>> | null>;
    updateOrCreate(artefact: Artefact<TSchema>, query?: TSchema): Promise<mongo.WithId<Artefact<TSchema>>>;
}

export class MongoStore<TSchema extends ArtefactData> implements Store<TSchema> {

    constructor(
        public readonly storage: Storage,
        public readonly name: string,
        public readonly options: any,
        private _collection: mongo.Collection<Artefact<TSchema>>,
    ) {}

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

    async updateOne(artefact: Artefact<TSchema>, query?: Filter<TSchema>, options: any = {}) {
        // if (query === undefined) {
        //     if (artefact._T.primary === undefined)
        //         throw new Error(`MongoStore.updateOrCreate(): artefact does not have a primary Model, so query parameter must be specified. artefact=${artefact}`);
        //     const primaryModelName = artefact._T.primary.name;
        //     query = { [primaryModelName]: artefact[primaryModelName].query } as any;
        // }
        const dbArtefact = await this._collection.updateOne(query!, { $set: artefact }, options);
        return dbArtefact;
    }

    async updateOrCreate(artefact: Artefact<TSchema>, query?: any) {
        if (query === undefined) {
            query = Artefact.query.byPrimary();
        }
        const dbArtefact = await this.findOne(query);
        if (dbArtefact !== undefined) {
            // update
        }
        return dbArtefact;
    }

}

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

// export interface Store<
//     TSchema extends { [K: string]: Partial<Model<TModel>> },
//     TModel extends Partial<Model<TModel>>
// > {
//     find(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<FindCursor<{ [K: string]: Model<TModel> }>>;
//     findOne(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<{ [K: string]: Model<TModel> } | null>;
//     updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options?: mongo.FindOneAndUpdateOptions): Promise<mongo.WithId<TSchema> | null>;
// };

// export class Store<
//     TSchema extends { [K: string]: Partial<Model<TModel>> },
//     TModel extends Partial<Model<TModel>>
// > {
//     private _collection: mongo.Collection<TSchema>;
//     private _modelClasses: { [K in keyof TSchema]: ClassConstructor<TSchema[K]> };

//     constructor(name: string, modelClasses: { [K in keyof TSchema]: ClassConstructor<TSchema[K]> }) {
//         this._collection = db.collection<TSchema>(name, {});
//         this._modelClasses = modelClasses;//new Map(Object.entries(modelClasses)); // .map(([K, ctor]) => ([ctor.name, ctor]) )
//     }

//     async find(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<FindCursor<{ [K: string]: Model<TModel> }>> {
//         return this._collection.find<TSchema>(filter, options).map(doc => Object.fromEntries(Object.keys(doc).map(K => ([K, new (this._modelClasses as any)[K]((doc as any)[K])]))));
//     }

//     async findOne(filter: Filter<TSchema>, options?: mongo.FindOptions): Promise<{ [K: string]: Model<TModel> } | null> {
//         const doc = await this._collection.findOne<TSchema>(filter, options);
//         return doc !== null ? Object.fromEntries(Object.keys(doc).map(K => ([K, new (this._modelClasses as any)[K]((doc as any)[K])]))) : null;
//     }

//     async updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options?: mongo.FindOneAndUpdateOptions): Promise<mongo.WithId<TSchema> | null> {
//         return await this._collection.findOneAndUpdate(filter, update, options ?? {});
//     }
    
//     async updateOrCreate(instance: Partial<TSchema>, findOneQuery: Filter<TSchema> /* { [K: string]: Partial<TSchema[typeof K]> } */) {
//         console.debug(`db.Store(name='${this._collection?.collectionName ?? ""}, modelClasses=<${Object.keys(this._modelClasses).join(',')}>).updateOrCreate(instance=Artefact<${Object.keys(instance).join(',')}>, findOneQuery=${JSON.stringify(findOneQuery)})`);
//         let dbData = await this._collection.findOne<Partial<TSchema>>(findOneQuery);
//         if (dbData !== null) {
//             if 
//         }
//             console.log(`does not exist yet in local DB`);
//     }
// }
