import { isDate } from "node:util/types";
import * as nodePath from "node:path";
import { AnyBulkWriteOperation, BulkWriteOptions, BulkWriteResult, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Filter, FindOneAndUpdateOptions, FindOptions, MongoClient, MongoError, UpdateFilter, UpdateOptions, UpdateResult, WithId, IndexSpecification, CreateIndexesOptions, Condition, Document } from "mongodb";
import { diff } from "deep-object-diff";
import { Artefact } from "./models/artefact";
import { AsyncFunction, Choose } from "./models/";
import { cargo } from "./pipeline";
import { get } from "./prop-path";
import { Progress } from "./progress";

import debug from "debug";
import { DeepProps } from "./models/index";
const log = debug(nodePath.basename(module.filename));

export interface Storage {
    isConnected(): boolean;
    connect(): Promise<Storage>;
    close(): Promise<Storage>;
    store<A extends Artefact>(name: string, options?: any): Promise<Store<A>>;
}

export class MongoStorage implements Storage {

    private _client: MongoClient | null = null;
    public get client() { return this._client; }
    
    private _connection: MongoClient | null = null;
    public get connection() { return this._connection; }

    private _db: Db | null = null;
    public get db() { return this._db; }

    constructor(public readonly url: string, public readonly options?: any) { }

    isConnected(): boolean {
        return this._client !== null;
    }

    async connect(): Promise<MongoStorage> {
        if (this._client === null) {
            log("Initialising DB connection to %s options=%O ... ", this.url, this.options);
            this._client = new MongoClient(this.url, this.options);
            this._connection = await this._client.connect();
            this._db = this._connection.db();
            log("OK");
        }
        return this;
    }

    async close(): Promise<MongoStorage> {
        if (!!this._connection) {
            log("close(): Closing DB connection to %s ... ", this.url);
            await this._connection.close();
            this._client = null;
            this._connection = null;
            this._db = null;
            log("OK");
        } else {
            log("close(): No DB connection to close");
        }
        return this;
    }

    async store<T extends {}>(name: string, options?: MongoStoreOptions): Promise<MongoStore<T>> {
        await this.connect();
        log("Getting store '%s' options=%O ... ", name, options);
        const store = new MongoStore<T>(this, name, options);
        log("OK");
        return store;
    }
}

export function isChangeInsert(value: ChangeStreamDocument): value is ChangeStreamInsertDocument {
    return value.operationType === "insert";
}
export function isChangeUpdate(value: ChangeStreamDocument): value is ChangeStreamUpdateDocument {
    return value.operationType === "update";
}

export type MongoStoreOptions = CollectionOptions & {
    createIndexes?: CreateIndexArgs[];
};
export const MongoStoreOptions: {
    default: MongoStoreOptions;
} = {
    default: {
        createIndexes: [],
    },
};

export type CreateIndexArgs = {
    index: IndexSpecification;
    options?: CreateIndexesOptions;
};

export const Query = <T extends Record<string, any>, P extends string | number = DeepProps<T>>(path: P, value: Condition<Choose<Artefact<T>, P>>): Filter<Artefact<T>> => ({ [path]: value, }) as Filter<Artefact<T>>;

export const updateResultToString = (result: UpdateResult | null | undefined) =>
    result === null ? "(null)" : result === undefined ? "(undef)" :
    "{ ack.=${result.acknowledged} modifiedCount=${result.modifiedCount} upsertedId=${result.upsertedId} upsertedCount=${result.upsertedCount} matchedCount=${result.matchedCount} }";

export type Updates<T extends {} = {}> = {
    update: Partial<T>;
    undefineds: Partial<Record<keyof T, undefined>>;
};

export const flattenPropertyNames = (
    source: { [K: string]: any; },
    update: ({ [K: string]: any; }) = {},
    undefineds: ({ [K: string]: any; }) = {},
    prefix: string = "",
) => {
    for (const K in source) {
        if (K === "_id") {
            continue;
        }
        const V = source[K];
        if (V !== null && V !== undefined && typeof V === "function") {
            continue;
        } else if (V !== null && V !== undefined && typeof V === "object" && !isDate(V)) {
            flattenPropertyNames(V, update, undefineds, prefix + K + ".");
        } else if (V !== undefined) {
            update[prefix + K] = V;
        } else {
            undefineds[prefix + K] = undefined;
        }
    }
    return { update, undefineds };
};

export const getUpdates = (original: any, updated?: any) => {
    if (!updated) {
        updated = original;
        original = {};
    } else {
        original ??= {};
        if (original._id && updated._id && original._id !== updated._id) {
            throw new RangeError("getUpdates(): original._id=${original._id} !== updated._id=${updated._id}");
        }
    }
    const updateDiff = diff(original, updated);
    const { update, undefineds } = flattenPropertyNames(updateDiff);
    return { update, undefineds } as Updates;
}

export type UpdateOrCreateOptions = {
    unsetUndefineds?: boolean;
};
export type UpdateOneResult<T extends {}> = {
    didWrite: boolean;
    result?: UpdateResult<Artefact<T>>;
    query: Filter<Artefact<T>>;
    updates: UpdateFilter<Artefact<T>>;
};
export type UpdateOrCreateResult<T extends {}> = UpdateOneResult<T> & {
    _: Partial<Artefact<T>>;
};
export type ProgressOption = { progress?: Progress; };

export type BulkWriterStore<T extends {}> = Store<T>;
export type BulkWriterFn<T extends {}> = AsyncFunction<[AsyncGenerator<AnyBulkWriteOperation<T>>], BulkWriteResult>;

export type BulkWriterOptions = BulkWriteOptions & {
    maxBatchSize: number;
    timeoutMs: number;
};
export const BulkWriterOptions = {
    default: {
        maxBatchSize: 10,
        timeoutMs: 200,
    } as BulkWriterOptions,
};

export interface Store<T extends {}> {
    createIndexes(...createIndexes: CreateIndexArgs[]): Promise<string[]>;
    count(query: Filter<Artefact<T>>, options?: CountOptions): Promise<number>;
    find(query: Filter<Artefact<T>>, options?: FindOptions & ProgressOption): AsyncGenerator<WithId<Artefact<T>>>;
    findOne(query: Filter<Artefact<T>>, options?: FindOptions): Promise<WithId<Artefact<T>> | null>;
    findOneAndUpdate(query: Filter<Artefact<T>>, update: UpdateFilter<Artefact<T>>, options?: FindOneAndUpdateOptions): Promise<WithId<Artefact<T>> | null>;
    updateOne(query: Filter<Artefact<T>>, update: UpdateFilter<Artefact<T>>, options?: UpdateOptions): Promise<UpdateOneResult<T> | null>;
    updateOrCreate(artefact: T, query: Filter<Artefact<T>>, options?: UpdateOptions & UpdateOrCreateOptions): Promise<UpdateOrCreateResult<T>>;
    bulkWrite(operations: AnyBulkWriteOperation<Artefact<T>>[], options?: BulkWriteOptions & ProgressOption): Promise<BulkWriteResult>;
    bulkWriterFn(options?: BulkWriterOptions & ProgressOption): BulkWriterFn<Artefact<T>>;
    bulkWriterStore(options?: BulkWriterOptions & ProgressOption): BulkWriterStore<T>;
    watch(pipeline?: Filter<Artefact<T>>/* Document[] */, options?: ChangeStreamOptions & ProgressOption): AsyncGenerator<ChangeStreamDocument<Artefact<T>>>;//: ChangeStream<A, ChangeStreamDocument<A>>;
};

export class MongoStore<T extends {}> implements Store<T> {
    public readonly collection: Collection<Artefact<T>>;
    constructor(
        public readonly storage: MongoStorage,
        public readonly name: string,
        options: MongoStoreOptions = {}
    ) {
        this.collection = storage.db!.collection<Artefact<T>>(name, options);
        this.options = { ...MongoStoreOptions.default, ...options };
        if (this.options.createIndexes && this.options.createIndexes.length > 0) {
            this.createIndexes(...this.options.createIndexes);
        }
     }

    public readonly options: MongoStoreOptions;

    async createIndexes(...createIndexes: CreateIndexArgs[]) {
        return await Promise.all(createIndexes.map(createIndex => {
            return this.collection.createIndex(createIndex.index, createIndex.options);
        }));
    }

    async count(query: Filter<Artefact<T>>, options: CountOptions = {}) {
        return this.collection.countDocuments(query, options);
    }

    async* find(query: Filter<Artefact<T>>, options: FindOptions & ProgressOption = {}) {
        // for await (const item of this._collection.find(query))
        //     yield item;
        if (options.progress) {
            options.progress.total = await this.collection.countDocuments(query);
        }
        yield* this.collection.find(query, options).map(r => {
            if (options.progress) {
                options.progress.count++;
            }
            return r;
        });
    }

    async findOne(query: Filter<Artefact<T>>, options: FindOptions = {}) {
        return await this.collection.findOne(query, options);
    }

    async findOneAndUpdate(query: Filter<Artefact<T>>, update: UpdateFilter<Artefact<T>>, options: FindOneAndUpdateOptions = {}) {
        return await this.collection.findOneAndUpdate(query, update, options);
    }

    async updateOne(query: Filter<Artefact<T>>, updates: UpdateFilter<Artefact<T>>, options: UpdateOptions = {}): Promise<UpdateOneResult<T>> {
        const result = await this.collection.updateOne(query!, updates, options);
        return { didWrite: !!result, result: result, query, updates };
    }

    async updateOrCreate(artefact: Partial<Artefact<T>>, query?: Filter<Artefact<T>>, options: UpdateOptions & UpdateOrCreateOptions = {}): Promise<UpdateOrCreateResult<T>> {
        options = { ...options, upsert: true }; //, ignoreUndefined: true, includeResultMetadata: true, returnDocument: "after", */ };
        if (!("_id" in artefact) && !query) {
            throw new RangeError("updateOrCreate(): artefact=${nodeUtil.inspect(artefact)} does not have an _id and query is not specified either");
        }
        query ??= ({ _id: artefact._id, });
        let result: UpdateResult<T> | undefined = undefined;
        const oldArtefact = await this.collection.findOne<Artefact<T>>(query, options);
        if (oldArtefact !== null && !artefact._id) {
            artefact._id = oldArtefact._id as Artefact<T>["_id"];
        }
        const updates = ({ $set: getUpdates(oldArtefact, artefact/* .toData() */).update }) as UpdateFilter<Artefact<T>>;
        // let update = { /* $set: { */ ...updates/* .update */ /* } *//* , ...(options.unsetUndefineds ? { $unset: updates.undefineds } : {}) */ } as UpdateFilter<A>;
        if (Object.keys(updates/* .update */).filter(u => u !== "_id").length > 0) {
            if (oldArtefact !== null) {
                query = ({ _id: oldArtefact._id, }) as Filter<Artefact<T>>;
            }
            result = await this.collection.updateOne(query, updates, options);
            if (!result?.acknowledged) {
                throw new MongoError("updateOne not acknowledged for dbArtefact=${dbArtefact} dbUpdate=${dbUpdate} dbResult=${dbResult}");
            } else {
                if (!artefact._id && !!result.upsertedId) {
                    artefact._id = result.upsertedId.toString() as Artefact<T>["_id"];
                }
            }
        }
        return { didWrite: !!result, result: result, query, updates, _: artefact };
    }

    bulkWrite(opsOrSource: AnyBulkWriteOperation<Artefact<T>>[] | AsyncGenerator<AnyBulkWriteOperation<Artefact<T>>>, options: BulkWriteOptions & BulkWriterOptions & ProgressOption = BulkWriterOptions.default): Promise<BulkWriteResult> {
        return Array.isArray(opsOrSource) ?
            this.collection.bulkWrite(opsOrSource, options) :
            this.bulkWriterFn(options)(opsOrSource);
    }

    bulkWriterFn(options: BulkWriterOptions & BulkWriteOptions & ProgressOption = BulkWriterOptions.default): BulkWriterFn<Artefact<T>> {
        const _this = this;
        return async function bulkWrite(source: AsyncGenerator<AnyBulkWriteOperation<Artefact<T>>>) {
            var result: BulkWriteResult = new BulkWriteResult();
            for await (const ops of cargo(options.maxBatchSize, options.timeoutMs, source)) {
                result = await _this.collection.bulkWrite(ops, options);
            }
            return result;
        }
    };

    bulkWriterStore(options: BulkWriterOptions & BulkWriteOptions & ProgressOption): BulkWriterStore<T> {
        return ({
            ...this,
            bulkWriterFn: this.bulkWriterFn.bind(this),
            bulkWriterStore: this.bulkWriterStore.bind(this),
            watch: this.watch.bind(this),
        });
    }

    async* watch(query: Filter<Artefact<T>>/* Document[] = [] */, options: ChangeStreamOptions & ProgressOption = {})/* : Promise<ChangeStream<A, ChangeStreamDocument<A>>> */ {
        if (options.progress) {
            options.progress.count = await this.collection.countDocuments(query);
        }
        /* return */yield* this.collection.watch([{ $match: query }], options);
    }
}
