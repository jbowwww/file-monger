import { isDate } from "node:util/types";
import * as nodePath from "node:path";
import { AnyBulkWriteOperation, BulkWriteOptions, BulkWriteResult, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Filter, FindOneAndUpdateOptions, FindOptions, MongoClient, MongoError, UpdateFilter, UpdateOptions, UpdateResult, WithId, IndexSpecification, CreateIndexesOptions, Condition, Document, OperationOptions, InsertOneModel, DeleteManyModel, DeleteOneModel, ReplaceOneModel, UpdateManyModel, UpdateOneModel, BSON, CollationOptions, Hint, DeleteOptions, ReplaceOptions, InsertOneOptions, OptionalId } from "mongodb";
import { diff } from "deep-object-diff";
import { Artefact, isArtefact, ArtefactStaticExtensionQueries, ArtefactStaticQueryFn, ArtefactFn } from "./models/artefact";
import { Aspect, AspectType, AsyncFunction, DeepProps, Choose, Constructor, isAspect, isConstructor, isFunction, AbstractConstructor, ValueUnion } from "./models/";
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

    async store<A extends Artefact>(name: string, artefactCtorOrOptions?: Constructor<A> | MongoStoreOptions<A>, options?: MongoStoreOptions<A>): Promise<MongoStore<A>> {
        await this.connect();
        log("Getting store '%s' options=%O ... ", name, artefactCtorOrOptions);
        const store = new MongoStore<A>(this, name, artefactCtorOrOptions, options);
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


export const Query = <
    TArtefact extends Artefact,
    TAspect extends Aspect = Aspect,
    PArtefact extends DeepProps<TArtefact> = DeepProps<TArtefact>,
    PAspect extends DeepProps<TAspect> = DeepProps<TAspect>,
>(
    aspectOrTypeOrName?: string | TAspect | Constructor<TAspect> /* AspectType<TAspect> *//* Constructor<TAspect> */ /* | DeepProps<WithId<TArtefact>> */,
    propertyPathOrValue?: /* DeepProps<WithId<TAspect>> */ string | Condition<Choose<Artefact, PArtefact>> | Condition<Choose<TAspect, PAspect>>,// | Partial<TAspect>,
    value?: unknown, //Condition<Choose<TArtefact, PArtefact>>,
    // options?: OperationOptions
): Filter<TArtefact> => {
    if (!aspectOrTypeOrName) {
        // No arguments - return POJO with basic queries whose fn's require arguments
        throw new TypeError(`Artefact.Query(): Must at least supply first parameter: aspectOrTypeOrName='${aspectOrTypeOrName}, propertyPath='${propertyPathOrValue}', valueOrOptions=${value}}, value=${value}}`);
    } else {
        let propPath!: string;
        if (typeof aspectOrTypeOrName === "string") {
            if (value) {
                throw new TypeError(`Artefact.Query(): aspectTypeOrName is a property path string, next parameter should be value to match and third parameter undefined`);
            }
            // Simple string property path for the Artefact given for aspectTypeOrName (dot notation for nested props) 
            propPath = aspectOrTypeOrName;
            value = propertyPathOrValue;
        } else if (isConstructor<TAspect>(aspectOrTypeOrName)) {
            // Only aspect type or aspect type class name or prefix (prop path from root of Artefact) specified -
            // Return queries POJO with byUnique hardwired for that aspect type
            propPath = aspectOrTypeOrName.name + typeof propertyPathOrValue === "string" ? "." + propertyPathOrValue : "";
        } else if (Aspect.is(aspectOrTypeOrName)) {
            propPath = aspectOrTypeOrName._T;
            value = aspectOrTypeOrName;
        }
        return ({ filter: { [propPath]: value, } });
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
    prefix: string = "",
    update: ({ [K: string]: any; }) = {},
    undefineds: ({ [K: string]: any; }) = {},
) => {
    for (const K in source) {
        if (K === "_id") {
            continue;
        }
        const V = source[K];
        if (V !== null && V !== undefined && typeof V === "function") {
            continue;
        } else if (V !== null && V !== undefined && typeof V === "object" && !isDate(V)) {
            flattenPropertyNames(V, prefix + K + ".", update, undefineds);
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
    const { update, undefineds } = flattenPropertyNames(aspectType ? { [aspectType as string]: get(updateDiff, aspectType as string), } : updateDiff);
    return { updated, original, aspectType, update, undefineds } as Updates<A>;
}

export type ProgressOption = { progress?: Progress; };

export type BulkWriterStore<A extends Artefact> = Store<A>;
export type ReadOperation<A extends Artefact> = {
    "findOne": { filter: Filter<A>, },
    "find": { filter: Filter<A>, },
    "count": { filter: Filter<A>, },
};

export type BulkOperationStats<A extends Artefact> = {
    // ...
};

export type BulkWriterSink<A extends Artefact> = AsyncFunction<[AsyncGenerator<AnyBulkWriteOperation<A>/*  | ReadOperation<A> *//* , BulkOperationStats<A>, WithId<A> | number */>], BulkWriteResult>;

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

export type BulkOpFnMap<T extends BSON.Document = BSON.Document> = {
    // TODO: Some typeof fancy mapped type and deduce the parameters of the fn's? I don't want to have to specify the object with prop names like updateOne: { filter: xxx, $set: yyy, ... },
    // i want functions that make the code more concise e.g.'s: updateOne(Query(FS.Disk, "path", "./file.txt"), fsDisk) , updateOne(Query(fsDisk, "path"), fsDisk)
    // [K in BulkOpNames]: 
    // TODO: Should do the above and integrate it with these same 6 operations defined on MongoStore as well, including the function arguments as a tuple? as a func type? some way to not type it 1600 times each
    insertOne(document: OptionalId<T>, options: InsertOneOptions): BulkOp<T, "insertOne">;
    updateOne(aspect: Aspect, options?: UpdateOptions): BulkOp<T, "updateOne">;
    updateMany(filter: Filter<T>, update: UpdateFilter<T>, options: UpdateOptions): BulkOp<T, "updateMany">;
    deleteOne(filter: Filter<T>, update: UpdateFilter<T>, options: DeleteOptions): BulkOp<T, "deleteOne">;
    deleteMany(filter: Filter<T>, update: UpdateFilter<T>, options: DeleteOptions): BulkOp<T, "deleteMany">;
    replaceOne(filter: Filter<T>, update: T, options: ReplaceOptions): BulkOp<T, "replaceOne">;
};
export type BulkOpModelMap<T extends BSON.Document = BSON.Document> = {
    insertOne: InsertOneModel<T>;
    updateOne: UpdateOneModel<T>;
    updateMany: UpdateManyModel<T>;
    deleteOne: DeleteOneModel<T>;
    deleteMany: DeleteManyModel<T>;
    replaceOne: ReplaceOneModel<T>;
};
export type BulkOpNames = keyof BulkOpModelMap;
export type BulkOpModels<T extends BSON.Document> = ValueUnion<BulkOpModelMap<T>>;
export type BulkOp<
    T extends BSON.Document,
    O extends keyof BulkOpModelMap<T>,
    M extends BulkOpModels<T> = BulkOpModelMap<T>[O]
> = {
        [K in O]: M;
    };
// may/probably won't go with this style?
// export const makeBulkOp = <
//     A extends Artefact,
//     O extends keyof BulkOpModelMap<A>,
//     M extends BulkOpModels<A> = BulkOpModelMap<A>[O]
// >(op: O) => class implements BulkOp<A, O, M>{
//     public get op() { return (this.constructor as Function & { readonly op: O; }).op; }
//     constructor(public readonly data: M) {};
//     execute() { return }
// };
// export const BulkOpInsertOne = makeBulkOp("insertOne");
// export const BulkOpUpdateOne = makeBulkOp("updateOne");
// export const BulkOpUpdateMany = makeBulkOp("updateMany");
// export const BulkOpDeleteOne = makeBulkOp("deleteOne");
// export const BulkOpDeleteMany = makeBulkOp("deleteMany");
// export const BulkOpReplaceOne = makeBulkOp("replaceOne");

export interface Store<A extends Artefact> {
    createIndexes(...createIndexes: CreateIndexArgs[]): Promise<string[]>;
    count(query: Filter<A>, options?: CountOptions): Promise<number>;
    find(query: Filter<A>, options?: FindOptions & ProgressOption): AsyncGenerator<WithId<A>>;
    findOne(query: Filter<A>, options?: FindOptions): Promise<WithId<A> | null>;
    findOneOrCreate(query: Filter<A>, createFn: () => A | Promise<A>, options?: FindOptions): Promise<A>;
    findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options?: FindOneAndUpdateOptions): Promise<WithId<A> | null>;
    updateOne(query: Filter<A>, update: UpdateFilter<A>, options?: UpdateOptions): Promise<UpdateResult<A> | null>;
    bulkWrite(operations: AnyBulkWriteOperation<A>[], options?: BulkWriteOptions & ProgressOption): Promise<BulkWriteResult>;
    bulkWriterSink(options?: BulkWriterOptions & ProgressOption): BulkWriterSink<A>;
    bulkWriterStore(options?: BulkWriterOptions & ProgressOption): BulkWriterStore<A>;
    watch(pipeline?: Filter<A>/* Document[] */, options?: ChangeStreamOptions & ProgressOption): AsyncGenerator<ChangeStreamDocument<A>>;
    ops: BulkOpFnMap<A>;
};

export class MongoStore<A extends Artefact> implements Store<A> {
    public readonly storage: MongoStorage;
    public readonly name: string;
    public readonly collection: Collection<A>;
    public readonly options: MongoStoreOptions<A>;
    public readonly artefactCtor?: Constructor<A>;

    constructor(
        storage: MongoStorage,
        name: string,
        artefactCtorOrOptions?: Constructor<A> | MongoStoreOptions<A>,
        options?: MongoStoreOptions<A>,
    ) {
        this.storage = storage;
        this.name = name;
        this.options = {
            ...MongoStoreOptions.default as MongoStoreOptions<A>,
            ...options || isConstructor(artefactCtorOrOptions, Artefact) ? {} : artefactCtorOrOptions,
        };
        this.collection = storage.db!.collection<A>(name, options);
        if (this.options.createIndexes && this.options.createIndexes.length > 0) {
            this.createIndexes(...this.options.createIndexes);
        }
    }

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
            return this.artefactCtor ? new this.artefactCtor(r) as WithId<A> : r;
        });
    }

    findOne(query: Filter<A>, options: FindOptions = {}) {
        return this.collection.findOne(query, options)
            .then(r => r && this.artefactCtor ? new this.artefactCtor(r) as WithId<A> : r);
    }

    findOneOrCreate(query: Filter<A>, createFn?: () => A | Promise<A>, options: FindOptions = {}) {
        return this.collection.findOne(query, options)
            .then(r => r as A ?? (createFn && createFn()))
            .then(r => this.artefactCtor ? new this.artefactCtor(r) : r);
    }

    findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options: FindOneAndUpdateOptions = {}) {
        options = { ...options, upsert: true, ignoreUndefined: true, };
        return this.collection.findOneAndUpdate(query, update, options)
            .then(r => this.artefactCtor ? new this.artefactCtor(r) as WithId<A> : r);
    }

    updateOne(query: Filter<A>, updates: UpdateFilter<A>, options: UpdateOptions = {}): Promise<UpdateResult<A>> {
        return this.collection.updateOne(query!, updates, options);
    }

    bulkWrite(opsOrSource: AnyBulkWriteOperation<A>[] | AsyncGenerator<AnyBulkWriteOperation<A>>, options: BulkWriteOptions & BulkWriterOptions & ProgressOption = BulkWriterOptions.default): Promise<BulkWriteResult> {
        return Array.isArray(opsOrSource) ?
            this.collection.bulkWrite(opsOrSource, options) :
            this.bulkWriterSink(options)(opsOrSource);
    }

    bulkWriterSink(options: BulkWriterOptions & BulkWriteOptions & ProgressOption = BulkWriterOptions.default): BulkWriterSink<A> {
        const _this = this;
        return async function bulkWrite(source: AsyncGenerator<AnyBulkWriteOperation<A>/*  | ReadOperation<A> */> | (() => AsyncGenerator<AnyBulkWriteOperation<A>/*  | ReadOperation<A> */>)) {
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
            bulkWriterSink: this.bulkWriterSink.bind(this),
            bulkWriterStore: this.bulkWriterStore.bind(this),
            watch: this.watch.bind(this),
        });
    }

    async* watch(query: Filter<A>/* Document[] = [] */, options: ChangeStreamOptions & ProgressOption = {})/* : Promise<ChangeStream<A, ChangeStreamDocument<A>>> */ {
        if (options.progress) {
            options.progress.count = await this.collection.countDocuments(query);
        }
        /* return */yield* this.collection.watch([{ $match: query }], options)
            .stream({ transform: r => this.artefactCtor ? new this.artefactCtor(r) as WithId<A> : r });
    }

    ops: BulkOpFnMap<A> = {
        insertOne: (document: OptionalId<A>, options?: InsertOneOptions) => ({ "insertOne": { document, ...options } }),
        updateOne: (aspect: Aspect, options: UpdateOptions = { upsert: true, }) => ({ "updateOne": { ...aspect.namespace({ filter: aspect.Query.byUnique(), update: { $set: flattenPropertyNames({ [aspect._T]: aspect.getUpdates(), }), } }), ...options, } }),
        updateMany: (filter: Filter<A>, update: UpdateFilter<A>, options: UpdateOptions = { upsert: true, }) => ({ "updateMany": { filter, update, ...options } }),
        deleteOne: (filter: Filter<A>, update: UpdateFilter<A>, options: DeleteOptions) => ({ "deleteOne": { filter, update, ...options } }),
        deleteMany: (filter: Filter<A>, update: UpdateFilter<A>, options: DeleteOptions) => ({ "deleteMany": { filter, update, ...options } }),
        replaceOne: (filter: Filter<A>, replacement: A, options: ReplaceOptions) => ({ "replaceOne": { filter, replacement, ...options } }),
    };
}
