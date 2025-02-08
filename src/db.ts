import * as nodeUtil from "node:util";
import { isDate } from "node:util/types";
import { AnyBulkWriteOperation, BulkWriteOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, Db, Filter, MongoClient, MongoClientOptions, MongoError, OrderedBulkOperation, UpdateFilter, UpdateOptions, UpdateResult, WithId } from "mongodb";
import { diff } from "deep-object-diff";
import { Artefact } from "./models";
import { AsyncFunction, buildObjectWithKeys, getKeysOfUndefinedValues } from "./utility";
import { isAsyncGenerator } from "./pipeline";

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

export interface Storage {
    isConnected(): boolean;
    connect(): Promise<Storage>;
    close(): Promise<Storage>;
    store<A extends Artefact>(name: string, options?: any): Promise<Store<A>>;
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

export function diffDotNotation(original: { [K: string]: any; }, updated: { [K: string]: any; }): ({ [K: string]: any; }) {
    const update = diff(original, updated);
    console.debug(`update=${nodeUtil.inspect(update)}`);
    const result = appendSubPropNames(update);
    console.debug(`result=${nodeUtil.inspect(result)}}`);
    return result;
    function appendSubPropNames(source: { [K: string]: any; }, result: ({ [K: string]: any; }) = {}, prefix: string = "") {
        console.debug(`appendSubPropNames(): source=${nodeUtil.inspect(source)}`);
        for (const K in source) {
            const V = source[K];
            console.debug(`appendSubPropNames(): K=${K} V=${nodeUtil.inspect(V)}`);
            if (V !== null && V !== undefined && V.prototype === Function.prototype) {
                continue;
            } else if (V !== null && V !== undefined && typeof V === "object" && !isDate(V)) {  //V.prototype !== Date.prototype
                appendSubPropNames(V, result, prefix + K + ".");
            } else {
                console.debug(`appendSubPropNames(): result["${prefix + K}"] = ${nodeUtil.inspect(V)}`);
                result[prefix + K] = V;
            }
        }
        return result;
    }
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

    async store<A extends Artefact>(name: string, options?: any): Promise<Store<A>> {
        await this.connect();
        process.stdout.write(`Getting store '${name} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
        const collection = this._db!.collection<A>(name, options);
        const store: Store<A> = new MongoStore<A>(this as Storage, name, options, collection);
        process.stdout.write("OK\n");
        return store;
    }

}

export type UpdateOrCreateResult<A extends Artefact> = {
    didWrite: boolean;
    result: UpdateResult<A>;
    query: Filter<A>;
    update: Partial<A>;
    _: A;
};

export type BulkWriteOp<A extends Artefact> = AnyBulkWriteOperation<A>;

export type BulkWriterResult<A extends Artefact> = {
    opCount: number;
    // etc
};

export interface Store<A extends Artefact> {
    count(query: Filter<A>, options?: CountOptions): Promise<number>;
    find(query: Filter<A>, options?: FindOptions): AsyncGenerator<WithId<A>>;
    findOne(query: Filter<A>, options?: FindOptions): Promise<WithId<A> | null>;
    findOneAndUpdate(query: Filter<A>, update: A, options?: FindOneAndUpdateOptions): Promise<WithId<A> | null>;
    updateOne(query: Filter<A>, update: UpdateFilter<A>, options?: UpdateOptions): Promise<UpdateResult<A> | null>;
    updateOrCreate(artefact: A, query: Filter<A>, options?: UpdateOptions): Promise<UpdateOrCreateResult<A>>;
}

export class MongoStore<A extends Artefact> implements Store<A> {

    constructor(
        public readonly storage: Storage,
        public readonly name: string,
        public readonly options: any,
        private _collection: Collection<A>,
    ) { }

    async count(query: Filter<A>, options: CountOptions = {}) {
        return this._collection.countDocuments(query, options);
    }

    async* find(query: Filter<A>, options: FindOptions = {}) {
        // for await (const item of this._collection.find(query))
        //     yield item;
        yield* this._collection.find(query, options);
    }

    async findOne(query: Filter<A>, options: FindOptions = {}) {
        return await this._collection.findOne(query, options);
    }

    async findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options: FindOneAndUpdateOptions = {}) {
        return await this._collection.findOneAndUpdate(query, update, options);
    }

    async updateOne(query: Filter<A>, update: UpdateFilter<A>, options: UpdateOptions = {}) {
        return await this._collection.updateOne(query!, { $set: { ...update as any/* TSchema */, _ts: new Date(), } }, options);
    }

    async updateOrCreate(artefact: A, query: Filter<A>, options: UpdateOptions = {}): Promise<UpdateOrCreateResult<A>> {
        options = { ...options, upsert: true, /* ignoreUndefined: true, includeResultMetadata: true, returnDocument: 'after', */ };
        let dbResult: UpdateResult<A> | undefined = undefined;
        const dbArtefact = await this._collection.findOne<A>(query, options);
        const dbId = artefact._id = dbArtefact?._id;
        const query2 = (!!dbId ? ({ _id: { $eq: dbId } }) : query) as Filter<A>;
        const { _id, ...dbUpdate } = diffDotNotation(dbArtefact ?? {}, artefact) as Partial<A>;
        const deleteKeys = getKeysOfUndefinedValues(dbUpdate);
        if (Object.keys(dbUpdate).length > 0) {
            dbResult = await this._collection.updateOne(query2, { $set: { ...dbUpdate } as Partial<A>, $unset: buildObjectWithKeys(deleteKeys, "") }, options);
            if (!dbResult || !dbResult.acknowledged) {
                throw new MongoError("updateOne not acknowledged for dbArtefact=${dbArtefact} dbUpdate=${dbUpdate}");
            } else {
                if (!artefact._id && !!dbResult.upsertedId) {
                    artefact._id = dbResult.upsertedId.toString();
                }
            }
        }
        const result = Object.assign({ didWrite: !!dbResult, result: dbResult, query, update: dbUpdate, _: artefact });
        console.log(`dbArtefact=${nodeUtil.inspect(dbArtefact)} dbId=${dbId} query=${nodeUtil.inspect(query)} query2=${nodeUtil.inspect(query2)} dbUpdate=${nodeUtil.inspect(dbUpdate)} result=${nodeUtil.inspect(result)}`);
        return result;
    }

    bulkWriter(
        optionsOrSource: BulkWriteOptions | AsyncGenerator<AnyBulkWriteOperation<A>>,
        source?: AsyncGenerator<AnyBulkWriteOperation<A>>
    ):
        Promise<BulkWriterResult<A>> |
        AsyncFunction<[AsyncGenerator<AnyBulkWriteOperation<A>>], Promise<BulkWriterResult<A>>>
    {
        const _this = this;
        let options: BulkWriteOptions;
        if (isAsyncGenerator(optionsOrSource)) {
            source = optionsOrSource;
            options = {};
        } else {
            options = optionsOrSource;
        }
        if (!source) {
            return bulkWrite;
        } else {
            return bulkWrite(source)
        }
        async function bulkWrite(source: AsyncGenerator<AnyBulkWriteOperation<A>>) {
            for await (const op of source) {
                _this._collection.bulkWrite([op], options);
            }
            var result: BulkWriterResult<A> = { opCount: 0, };
            return result;
        };
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
