import * as nodeUtil from "node:util";
import { isDate } from "node:util/types";
import { AnyBulkWriteOperation, BulkWriteOptions, BulkWriteResult, ChangeStream, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Document, Filter, FindOneAndUpdateOptions, FindOptions, ModifyResult, MongoClient, MongoClientOptions, MongoError, OrderedBulkOperation, UpdateFilter, UpdateOptions, UpdateResult, WithId, IndexSpecification, CreateIndexesOptions } from "mongodb";
import { diff } from "deep-object-diff";
import { Artefact, Aspect, AspectFn, Constructor, filterObject, isAspect, mapObject, QueryableArtefact } from "./models";
import { AsyncFunction, buildObjectWithKeys, getKeysOfUndefinedValues, enumerable } from './utility';
import { cargo, isAsyncGenerator, pipe } from "./pipeline";
import { get } from "./prop-path";
import { Progress } from "./progress";

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
            process.stdout.write(`close(): Closing DB connection to ${this.url} ... `);
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

    async store<A extends Artefact>(name: string, options?: MongoStoreOptions): Promise<MongoStore<A>> {
        await this.connect();
        process.stdout.write(`Getting store '${name} ${options !== undefined ? ("options=" + JSON.stringify(options)) : ""} ... `);
        const collection = this._db!.collection<A>(name, options);
        const store = new MongoStore<A>(this as Storage, name, collection, options);
        process.stdout.write("OK\n");
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

export const Query = <A extends Artefact>(_: A, path: string): Filter<A> => ({
    [path]: get(_, path)
}) as Filter<A>;

export const updateResultToString = (result: UpdateResult | null | undefined) =>
    result === null ? "(null)" : result === undefined ? "(undef)" :
    `{ ack.=${result.acknowledged} modifiedCount=${result.modifiedCount} upsertedId=${result.upsertedId} upsertedCount=${result.upsertedCount} matchedCount=${result.matchedCount} }`;

export type Updates<T extends {} = {}> = {
    update: Partial<T>;
    undefineds: Partial<Record<keyof T, undefined>>;
};

export const getUpdates = (original: any, updated?: any) => {
    if (!updated) {
        updated = original;
        original = {};
    } else if (original._id && updated._id && original._id !== updated._id) {
        throw new RangeError(`getUpdates(): original._id=${original._id} !== updated._id=${updated._id}`);
    }
    const updateDiff = diff(original, updated);
    const { update, undefineds } = appendSubPropNames(updateDiff);
    return { update, undefineds } as Updates;
    function appendSubPropNames(source: { [K: string]: any; }, update: ({ [K: string]: any; }) = {}, undefineds: ({ [K: string]: any; }) = {}, prefix: string = "") {
        for (const K in source) {
            if (K === "_id") {
                continue;
            }
            const V = source[K];
            if (V !== null && V !== undefined && typeof V === "function") {
                continue;
            } else if (V !== null && V !== undefined && typeof V === "object" && !isDate(V)) {
                appendSubPropNames(V, update, undefineds, prefix + K + ".");
            } else if (V !== undefined) {
                update[prefix + K] = V;
            } else {
                undefineds[prefix + K] = undefined;
            }
        }
        return { update, undefineds };
    }
}

function getData<A extends Artefact>(_: A): Partial<A> {
    const descriptors = Object.getOwnPropertyDescriptors(_);
    const data = mapObject(descriptors as Record<PropertyKey, PropertyDescriptor>, ([K, V]) => V.value, ([K, V]) => ([K, V.value])  ); // should filter out getters (for now - TODO: decorators to opt-in getters)
    console.log(`getData(): _=${nodeUtil.inspect(_)} descriptors=${nodeUtil.inspect(descriptors)} data=${nodeUtil.inspect(data)}`);
    return data as Partial<A>;
}

export type UpdateOrCreateOptions = {
    unsetUndefineds?: boolean;
};
export type UpdateOrCreateResult<A extends Artefact> = {
    didWrite: boolean;
    result?: UpdateResult<A>;
    query: Filter<A>;
    update: UpdateFilter<A>;//Omit<Partial<A>, "_id">;
    _: A;
};

export type ProgressOption = { progress?: Progress; };

export type BulkWriterStore<A extends Artefact> = Store<A>;
export type BulkWriterFn<A extends Artefact> = AsyncFunction<[AsyncGenerator<AnyBulkWriteOperation<A>>], BulkWriteResult>;

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

export interface Store<A extends Artefact> {
    createIndexes(...createIndexes: CreateIndexArgs[]): Promise<string[]>;
    count(query: Filter<A>, options?: CountOptions): Promise<number>;
    find(query: Filter<A>, options?: FindOptions & ProgressOption): AsyncGenerator<WithId<A>>;
    findOne(query: Filter<A>, options?: FindOptions): Promise<WithId<A> | null>;
    findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options?: FindOneAndUpdateOptions): Promise<WithId<A> | null>;
    updateOne(query: Filter<A>, update: UpdateFilter<A>, options?: UpdateOptions): Promise<UpdateResult<A> | null>;
    updateOrCreate(artefact: A, query: Filter<A>, options?: UpdateOptions & UpdateOrCreateOptions): Promise<UpdateOrCreateResult<A>>;
    bulkWrite(operations: AnyBulkWriteOperation<A>[], options?: BulkWriteOptions & ProgressOption): Promise<BulkWriteResult>;
    bulkWriterFn(options?: BulkWriterOptions & ProgressOption): BulkWriterFn<A>;
    bulkWriterStore(options?: BulkWriterOptions & ProgressOption): BulkWriterStore<A>;
    watch(pipeline?: Filter<A>/* Document[] */, options?: ChangeStreamOptions & ProgressOption): AsyncGenerator<ChangeStreamDocument<A>>;//: ChangeStream<A, ChangeStreamDocument<A>>;
};

export class MongoStore<A extends Artefact> implements Store<A> {

    constructor(
        public readonly storage: Storage,
        public readonly name: string,
        public readonly collection: Collection<A>,
        options: MongoStoreOptions = {}
    ) {
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

    async count(query: Filter<A>, options: CountOptions = {}) {
        return this.collection.countDocuments(query, options);
    }

    async* find(query: Filter<A>, options: FindOptions & ProgressOption = {}) {
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

    async findOne(query: Filter<A>, options: FindOptions = {}) {
        return await this.collection.findOne(query, options);
    }

    async findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options: FindOneAndUpdateOptions = {}) {
        return await this.collection.findOneAndUpdate(query, update, options);
    }

    async updateOne(query: Filter<A>, update: UpdateFilter<A>, options: UpdateOptions = {}) {
        console.debug(`updateOne(): query=${nodeUtil.inspect(query)} update=${nodeUtil.inspect(update)} options=${nodeUtil.inspect(options)}`);
        return await this.collection.updateOne(query!, {
            // $set: {
            ...update as any/* TSchema */,
            // _ts: new Date(),
            // }
        }, options);
    }

    async updateOrCreate(artefact:/*  QueryableArtefact< */A/* > */, query?: Filter<A>, options: UpdateOptions & UpdateOrCreateOptions = {}): Promise<UpdateOrCreateResult<A>> {
        options = { ...options, upsert: true, ignoreUndefined: true }; //, includeResultMetadata: true, returnDocument: 'after', */ };
        if (artefact._id) {
            const keys = Object.keys(artefact);
            if (keys.length !== 1 || keys[0] !== "_id") {
                throw new RangeError(`updateOrCreate(): artefact=${nodeUtil.inspect(artefact)} has an _id but query=${nodeUtil.inspect(query)}, when query should be based solely on _id`);
            }
        }
        let result: UpdateResult<A> | undefined = undefined;
        query ??= artefact.Query.byId() as Filter<A>;
        const oldArtefact = await this.collection.findOne<A>(query, options) ;
        if (oldArtefact !== null && !artefact._id) {
            artefact._id = oldArtefact._id;
        }
        const updates = getUpdates(oldArtefact ?? {} as A, getData(artefact));
        let update = { $set: { ...updates.update }, ...(options.unsetUndefineds ? { $unset: updates.undefineds } : {}) } as UpdateFilter<A>;
        if (Object.keys(updates.update).filter(u => u !== "_id").length > 0) {
            if (oldArtefact !== null) {
                query = Artefact.Query.byId(oldArtefact) as Filter<A>;
            }
            result = await this.collection.updateOne(query, update, options);
            if (!result?.acknowledged) {
                throw new MongoError("updateOne not acknowledged for dbArtefact=${dbArtefact} dbUpdate=${dbUpdate} dbResult=${dbResult}");
            } else {
                if (!artefact._id && !!result.upsertedId) {
                    artefact._id = result.upsertedId.toString();
                }
            }
        }
        return { didWrite: !!result, result: result, query, update, _: artefact };
    }

    bulkWrite(opsOrSource: AnyBulkWriteOperation<A>[] | AsyncGenerator<AnyBulkWriteOperation<A>>, options: BulkWriteOptions & BulkWriterOptions & ProgressOption = BulkWriterOptions.default): Promise<BulkWriteResult> {
        return Array.isArray(opsOrSource) ?
            this.collection.bulkWrite(opsOrSource, options) :
            this.bulkWriterFn(options)(opsOrSource);
    }

    bulkWriterFn(options: BulkWriterOptions & BulkWriteOptions & ProgressOption = BulkWriterOptions.default): BulkWriterFn<A> {
        const _this = this;
        return async function bulkWrite(source: AsyncGenerator<AnyBulkWriteOperation<A>>) {
            var result: BulkWriteResult = new BulkWriteResult();
            for await (const ops of cargo(options.maxBatchSize, options.timeoutMs, source)) {
                result = await _this.collection.bulkWrite(ops, options);
            }
            return result;
        }
    };

    bulkWriterStore(options: BulkWriterOptions & BulkWriteOptions & ProgressOption): BulkWriterStore<A> {
        return ({
            ...this,
            bulkWriterFn: this.bulkWriterFn.bind(this),
            bulkWriterStore: this.bulkWriterStore.bind(this),
            watch: this.watch.bind(this),
        });
    }

    async* watch(query: Filter<A>/* Document[] = [] */, options: ChangeStreamOptions & ProgressOption = {})/* : Promise<ChangeStream<A, ChangeStreamDocument<A>>> */ {
        if (options.progress) {
            options.progress.count = await this.collection.countDocuments(query);
        }
        /* return */yield* this.collection.watch([{ $match: query }], options);
    }
}


// export type Query<A extends Aspect = Aspect> = ({ [K: string]: (...args: any[]) => ({ [K: string]: Filter<A>; }) });
// export const Query = Object.assign(
//     <A extends Aspect>(aspectOrAspectFn: A | AspectFn<A>, path?: string): Query<A> => {
//         const propertyDottedName = (isAspect(aspectOrAspectFn) ? aspectOrAspectFn._T : aspectOrAspectFn.name).toString() + (path ? "." + path : "");
//         return ({
//             exists: (exists: boolean = true) => ({ [propertyDottedName]: { $exists: exists } }),
//             equals: (value?: any) => ({ [propertyDottedName]: { $eq: value ?? isAspect(aspectOrAspectFn) ? get(aspectOrAspectFn, path!) : value } }),   // not sure this one's right
//         });
//     },
//     {
//         and: (...conditions: (Filter<Document>)[]) => ({ $and: conditions }),
//         or: (...conditions: (Filter<Document>)[]) => ({ $or: conditions }),
//     });
