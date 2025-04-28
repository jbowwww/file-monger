import { isDate } from "node:util/types";
import * as nodePath from "node:path";
import { AnyBulkWriteOperation, BulkWriteOptions, BulkWriteResult, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Filter, FindOneAndUpdateOptions, FindOptions, MongoClient, MongoError, UpdateFilter, UpdateOptions, UpdateResult, WithId, IndexSpecification, CreateIndexesOptions, Condition, Document } from "mongodb";
import { diff } from "deep-object-diff";
import { Artefact, isArtefact, ArtefactStaticExtensionQueries, ArtefactStaticQueryFn } from "./models/artefact";
import { Aspect, AspectType, AsyncFunction, DeepProps, Choose, Constructor, isAspect, isConstructor, isFunction } from "./models/";
import { cargo } from "./pipeline";
import { get } from "./prop-path";
import { Progress } from "./progress";

import debug from "debug";
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

    async store<A extends Artefact>(name: string, options?: MongoStoreOptions): Promise<MongoStore<A>> {
        await this.connect();
        log("Getting store '%s' options=%O ... ", name, options);
        const store = new MongoStore<A>(this, name, options);
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

export type MongoStoreOptions<A extends Artefact = Artefact> = CollectionOptions & {
    createIndexes?: CreateIndexArgs[];
    queries?: {
        byUnique?: ArtefactStaticQueryFn<A>;    // byUnique is required to use store.updateOrCreate() or findOne() with a single Artefact arg (and probably other things sooner or later)
    } & ArtefactStaticExtensionQueries<A>;      // unlike extension queries which may take any args, byUnique must take only the single Artefact arg as a static query method (or no args if implement as ArtefactInstanceQueryFn in future)
};
export const MongoStoreOptions: {
    default: MongoStoreOptions;
} = {
    default: {
        createIndexes: [],
        queries: {
            byUnique: <A extends Artefact>(_: A) => ({ "_id": _._id, }),
        },
    },
};

export type CreateIndexArgs = {
    index: IndexSpecification;
    options?: CreateIndexesOptions;
};

export class Query<
    A extends Artefact,
    P extends DeepProps<A> = DeepProps<A>
> {
    [K: string]: Condition<WithId<A>>;
    constructor(
        aspectTypeOrPrefix: Aspect | Constructor<Aspect> | DeepProps<WithId<A>>,
        valueOrSuffix: Condition<Choose<A, P>> | DeepProps<WithId<A>>,
        value?: Condition<Choose<A, P>>
    ) {
        this[
            (typeof aspectTypeOrPrefix === "string" ? aspectTypeOrPrefix :
            isConstructor(aspectTypeOrPrefix) ? aspectTypeOrPrefix.name :
            isAspect(aspectTypeOrPrefix) ? aspectTypeOrPrefix._T : "") +
            typeof valueOrSuffix === "string" ? "." + valueOrSuffix : ""
        ] = (
            typeof valueOrSuffix === "string" ? value : valueOrSuffix
        ) as Condition<WithId<A>>;
    }
}

export const updateResultToString = (result: UpdateResult | null | undefined) =>
    result === null ? "(null)" : result === undefined ? "(undef)" :
    "{ ack.=${result.acknowledged} modifiedCount=${result.modifiedCount} upsertedId=${result.upsertedId} upsertedCount=${result.upsertedCount} matchedCount=${result.matchedCount} }";

export type Updates<A extends Artefact> = {
    updated: Partial<A>;
    original?: A;
    aspectType?: Constructor<A>;
    update: Partial<A>;
    undefineds: Partial<Record<keyof A, undefined>>;
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

// Returns a flattened list of property paths that exist in updated, that are not equal to the same property in original (if supplied)
export const getUpdates = <A extends Artefact>(updated: Partial<A>, originalOrAspectType?: A | AspectType, aspectType?: AspectType) => {
    let original: A | undefined;
    let updateDiff: object;
    if (originalOrAspectType) {
        if (isArtefact(originalOrAspectType)) {
            original = originalOrAspectType;
            if (original._id && updated._id && original._id !== updated._id) {
                throw new RangeError("getUpdates(): original._id=${original._id} !== updated._id=${updated._id}");
            }
            updateDiff = diff(original, updated);
        } else {
            if (originalOrAspectType) {
                aspectType = originalOrAspectType;
            }
            updateDiff = updated as object;
        }
    } else {
        if (aspectType) {
            throw new RangeError(`getUpdates(): if originalOrAspectType is null, aspectType should be null too`);
        }
        updateDiff = updated as object;
    }
    if (isConstructor(aspectType)) {
        aspectType = aspectType.name;
    }
    const { update, undefineds } = flattenPropertyNames(aspectType ? { [aspectType]: get(updateDiff, aspectType), } : updateDiff);
    return { updated, original, aspectType, update, undefineds } as Updates<A>;
}

export type UpdateOrCreateOptions = {
    unsetUndefineds?: boolean;
};
export type UpdateOneResult<A extends Artefact> = {
    didWrite: boolean;
    result?: UpdateResult<A>;
    query: Filter<A>;
    updates: UpdateFilter<A>;
};
export type UpdateOrCreateResult<A extends Artefact> = UpdateOneResult<A> & {
    _: Partial<A>;
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
    updateOne(query: Filter<A>, update: UpdateFilter<A>, options?: UpdateOptions): Promise<UpdateOneResult<A> | null>;
    updateOrCreate(artefact: A, query: Filter<A>, options?: UpdateOptions & UpdateOrCreateOptions): Promise<UpdateOrCreateResult<A>>;
    bulkWrite(operations: AnyBulkWriteOperation<A>[], options?: BulkWriteOptions & ProgressOption): Promise<BulkWriteResult>;
    bulkWriterFn(options?: BulkWriterOptions & ProgressOption): BulkWriterFn<A>;
    bulkWriterStore(options?: BulkWriterOptions & ProgressOption): BulkWriterStore<A>;
    watch(pipeline?: Filter<A>/* Document[] */, options?: ChangeStreamOptions & ProgressOption): AsyncGenerator<ChangeStreamDocument<A>>;//: ChangeStream<A, ChangeStreamDocument<A>>;
    ops: {
        updateOne(_: A): AnyBulkWriteOperation<A>;
    };
};

export class MongoStore<A extends Artefact> implements Store<A> {
    public readonly collection: Collection<A>;
    constructor(
        public readonly storage: MongoStorage,
        public readonly name: string,
        options: MongoStoreOptions = {}
    ) {
        this.collection = storage.db!.collection<A>(name, options);
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

    async updateOne(query: Filter<A>, updates: UpdateFilter<A>, options: UpdateOptions = {}): Promise<UpdateOneResult<A>> {
        const result = await this.collection.updateOne(query!, updates, options);
        return { didWrite: !!result, result: result, query, updates };
    }

    async updateOrCreate(artefact: Partial<A>, query?: Filter<A>, options: UpdateOptions & UpdateOrCreateOptions = {}): Promise<UpdateOrCreateResult<A>> {
        options = { ...options, upsert: true }; //, ignoreUndefined: true, includeResultMetadata: true, returnDocument: "after", */ };
        if (!("_id" in artefact) && !query) {
            throw new RangeError("updateOrCreate(): artefact=${nodeUtil.inspect(artefact)} does not have an _id and query is not specified either");
        }
        query ??= ({ _id: artefact._id, }) as Filter<A>;
        let result: UpdateResult<A> | undefined = undefined;
        const oldArtefact = await this.collection.findOne<A>(query, options);
        if (oldArtefact !== null && !artefact._id) {
            artefact._id = oldArtefact._id as A["_id"];
        }
        const updates = ({ $set: getUpdates(artefact/* .toData() */, oldArtefact ?? undefined).update }) as UpdateFilter<A>;
        // let update = { /* $set: { */ ...updates/* .update */ /* } *//* , ...(options.unsetUndefineds ? { $unset: updates.undefineds } : {}) */ } as UpdateFilter<A>;
        if (Object.keys(updates/* .update */).filter(u => u !== "_id").length > 0) {
            if (oldArtefact !== null) {
                query = ({ _id: oldArtefact._id, }) as Filter<A>;
            }
            result = await this.collection.updateOne(query, updates, options);
            if (!result?.acknowledged) {
                throw new MongoError("updateOne not acknowledged for dbArtefact=${dbArtefact} dbUpdate=${dbUpdate} dbResult=${dbResult}");
            } else {
                if (!artefact._id && !!result.upsertedId) {
                    artefact._id = result.upsertedId.toString() as A["_id"];
                }
            }
        }
        return { didWrite: !!result, result: result, query, updates, _: artefact };
    }

    bulkWrite(opsOrSource: AnyBulkWriteOperation<A>[] | AsyncGenerator<AnyBulkWriteOperation<A>>, options: BulkWriteOptions & BulkWriterOptions & ProgressOption = BulkWriterOptions.default): Promise<BulkWriteResult> {
        return Array.isArray(opsOrSource) ?
            this.collection.bulkWrite(opsOrSource, options) :
            this.bulkWriterFn(options)(opsOrSource);
    }

    bulkWriterFn(options: BulkWriterOptions & BulkWriteOptions & ProgressOption = BulkWriterOptions.default): BulkWriterFn<A> {
        const _this = this;
        return async function bulkWrite(source: AsyncGenerator<AnyBulkWriteOperation<A>> | (() => AsyncGenerator<AnyBulkWriteOperation<A>>)) {
            var result: BulkWriteResult = new BulkWriteResult();
            for await (const ops of cargo(options.maxBatchSize, options.timeoutMs, isFunction(source) ? source() : source)) {
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

    ops = {
        updateOne: (updated: A, originalOrAspectType?: A | AspectType, aspectType?: AspectType): AnyBulkWriteOperation<A> => {
            const filter = this.options.queries?.byUnique?.(updated) as Filter<A>;
            let update = getUpdates<A>(updated, originalOrAspectType, aspectType);
            const aspectTypeName = update.aspectType?.name;
            return ({ "updateOne": { filter, update: { $set: update.update }, } });
        }
    };
}
