import * as nodePath from "node:path";
import mongo, { AnyBulkWriteOperation, BulkWriteOptions, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Filter, FindOneAndUpdateOptions, FindOptions, MongoClient, UpdateFilter, UpdateOptions, UpdateResult, IndexSpecification, CreateIndexesOptions, Condition, InsertOneModel, DeleteManyModel, DeleteOneModel, ReplaceOneModel, UpdateManyModel, UpdateOneModel, BSON, DeleteOptions, ReplaceOptions, InsertOneOptions, OptionalId, WithoutId } from "mongodb";
import { Artefact, ArtefactQueryFn, hasId, isArtefact } from "./models/artefact";
import { Aspect, DeepProps, Choose, Constructor, isConstructor, ValueUnion, makeDefaultOptions, isNonDateObject, ProgressOption } from "./models/";
import { PipelineGeneratorStage, PipelineSink, batch, isIterable, makeAsyncGenerator } from "./pipeline";
import { Progress } from "./progress";

import { inspect } from "node:util";
import debug from "debug";
import { PipelineSource } from "node:stream";
const log = debug(nodePath.basename(module.filename));

export interface Storage {
    isConnected(): boolean;
    connect(): Promise<Storage>;
    close(): Promise<Storage>;
    store<A extends Artefact>(name: string, artefactCtorOrOptions?: Constructor<A> | MongoStoreOptions<A>, options?: any): Promise<Store<A>>;
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

    async store<A extends Artefact>(name: string, options?: MongoStoreOptions<A>): Promise<MongoStore<A>> {
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
        byUnique?: ArtefactQueryFn<A>;    // byUnique is required to use store.updateOrCreate() or findOne() with a single Artefact arg (and probably other things sooner or later)
    };      // unlike extension queries which may take any args, byUnique must take only the single Artefact arg as a static query method (or no args if implement as ArtefactInstanceQueryFn in future)
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
        } else if (V !== null && V !== undefined && isNonDateObject(V)) {
            flattenPropertyNames(V, prefix + K + ".", update, undefineds);
        } else if (V !== undefined) {
            update[prefix + K] = V;
        } else {
            undefineds[prefix + K] = undefined;
        }
    }
    return { update, undefineds };
};

// // Returns a flattened list of property paths that exist in updated, that are not equal to the same property in original (if supplied)
// export const getUpdates = <A extends Artefact>(updated: Partial<A>, originalOrAspectType?: A | AspectType, aspectType?: AspectType) => {
//     let original: A | undefined;
//     let updateDiff: object;
//     if (originalOrAspectType) {
//         if (isArtefact(originalOrAspectType)) {
//             original = originalOrAspectType;
//             if (original._id && updated._id && original._id !== updated._id) {
//                 throw new RangeError("getUpdates(): original._id=${original._id} !== updated._id=${updated._id}");
//             }
//             updateDiff = diff(original, updated);
//         } else {
//             if (originalOrAspectType) {
//                 aspectType = originalOrAspectType;
//             }
//             updateDiff = updated as object;
//         }
//     } else {
//         if (aspectType) {
//             throw new RangeError(`getUpdates(): if originalOrAspectType is null, aspectType should be null too`);
//         }
//         updateDiff = updated as object;
//     }
//     if (isConstructor(aspectType)) {
//         aspectType = aspectType.name;
//     }
//     const { update, undefineds } = flattenPropertyNames(aspectType ? { [aspectType as string]: get(updateDiff, aspectType as string), } : updateDiff);
//     return { updated, original, aspectType, update, undefineds } as Updates<A>;
// }

export type BulkWriterStore<A extends Artefact> = Store<A>;
export type ReadOperation<A extends Artefact> = {
    "findOne": { filter: Filter<A>, },
    "find": { filter: Filter<A>, },
    "count": { filter: Filter<A>, },
};

export type BulkOperationStats<A extends Artefact> = {
    // ...
};

export interface BulkWriterSink<A extends Artefact> extends PipelineGeneratorStage<BulkOp<A>, mongo.BulkWriteResult, any, void> {}     //AsyncFunction<[AsyncGenerator<AnyBulkWriteOperation<A>/*  | ReadOperation<A> *//* , BulkOperationStats<A>, WithId<A> | number */>], BulkWriteResult>;

export type BulkWriterOptions = BulkWriteOptions & {
    maxBatchSize: number;
    timeoutMs: number;
} & ProgressOption;
export const BulkWriterOptions = makeDefaultOptions<BulkWriterOptions>({
    maxBatchSize: 10,
    timeoutMs: 200,
});

export type BulkOpFnMap<T extends BSON.Document = BSON.Document, TOut extends BSON.Document = T> = {
    // TODO: Some typeof fancy mapped type and deduce the parameters of the fn's? I don't want to have to specify the object with prop names like updateOne: { filter: xxx, $set: yyy, ... },
    // i want functions that make the code more concise e.g.'s: updateOne(Query(FS.Disk, "path", "./file.txt"), fsDisk) , updateOne(Query(fsDisk, "path"), fsDisk)
    // [K in BulkOpNames]: 
    // TODO: Should do the above and integrate it with these same 6 operations defined on MongoStore as well, including the function arguments as a tuple? as a func type? some way to not type it 1600 times each
    insertOne(_: T, options: InsertOneOptions): BulkOp<TOut, "insertOne">;
    updateOne(_: T, options?: UpdateOptions): BulkOp<TOut, "updateOne">;
    updateMany(_: Filter<T>, update: UpdateFilter<TOut>, options: UpdateOptions): BulkOp<TOut, "updateMany">;
    deleteOne(_: T, update: UpdateFilter<TOut>, options: DeleteOptions): BulkOp<TOut, "deleteOne">;
    deleteMany(_: Filter<T>, update: UpdateFilter<TOut>, options: DeleteOptions): BulkOp<TOut, "deleteMany">;
    replaceOne(_: T, replacement: WithoutId<TOut>, options: ReplaceOptions): BulkOp<TOut, "replaceOne">;
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
export type BulkOp<T extends BSON.Document, O extends keyof BulkOpModelMap<T> = keyof BulkOpModelMap<T>, > = { [K in O]: BulkOpModelMap<T>[O]; };

export type BulkWriteSinkResult<A extends Artefact = Artefact> = {
    ops: AnyBulkWriteOperation<A>[];
    result: mongo.BulkWriteResult;
};

export interface Store<A extends Artefact = Artefact> {
    createIndexes(...createIndexes: CreateIndexArgs[]): Promise<string[]>;
    count(query: Filter<A>, options?: CountOptions): Promise<number>;
    find(query: Filter<A>, options?: FindOptions & ProgressOption): AsyncGenerator<A>;
    findOne(query: Filter<A>, options?: FindOptions): Promise<A | null>;
    findOneOrCreate(query: Filter<A>, createFn: () => A | Promise<A>, options?: FindOptions): Promise<A>;
    findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options?: FindOneAndUpdateOptions): Promise<A | null>;
    updateOne(query: Filter<A>, update: UpdateFilter<A>, options?: UpdateOptions): Promise<UpdateResult<A> | null>;
    bulkWrite(operations: AsyncIterable<AnyBulkWriteOperation<A>>, options?: BulkWriteOptions & ProgressOption): AsyncGenerator<BulkWriteSinkResult<A>>;
    bulkWriterSink(options?: Partial<BulkWriterOptions & ProgressOption>): PipelineSink<AnyBulkWriteOperation<A>>;
    bulkWriterStore(options?: Partial<BulkWriterOptions & ProgressOption>): BulkWriterStore<A>;
    watch(pipeline?: Filter<A>, options?: ChangeStreamOptions & ProgressOption): AsyncGenerator<ChangeStreamDocument<A>>;
    ops: BulkOpFnMap<A | Aspect, A>;
};

export class MongoStore<A extends Artefact> implements Store<A> {
    public readonly storage: MongoStorage;
    public readonly name: string;
    public readonly collection: Collection<A>;
    public readonly options: MongoStoreOptions<A>;

    constructor(
        storage: MongoStorage,
        name: string,
        // artefactCtorOrOptions?: Constructor<A> | MongoStoreOptions<A>,
        options?: MongoStoreOptions<A>,
    ) {
        this.storage = storage;
        this.name = name;
        // this.artefactCtor = isConstructor<Artefact>(artefactCtorOrOptions) ? artefactCtorOrOptions : undefined;
        this.options = {
            ...MongoStoreOptions.default as MongoStoreOptions<A>,
            ...options,// || isConstructor(artefactCtorOrOptions, Artefact) ? {} : artefactCtorOrOptions,
        };
        this.collection = storage.db!.collection<A>(this.name, this.options);
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
            log(`find(): r = ${inspect(r)}`);
            return r as A;
        });
    }

    findOne(query: Filter<A>, options: FindOptions = {}) {
        return this.collection.findOne(query, options)
            .then(r => {
                log(`findOne(): r = ${inspect(r)}`);
                return r as A;
            });
    }

    findOneOrCreate(query: Filter<A>, createFn?: () => A | Promise<A>, options: FindOptions = {}) {
        return this.collection.findOne(query, options)
            .then(r => r as A ?? (createFn && createFn()))
            .then(r => {
                log(`findOneOrCreate(): r = ${inspect(r)}`);
                return r as A;
            });
    }

    findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options: FindOneAndUpdateOptions = {}) {
        options = { ...options, upsert: true, ignoreUndefined: true, };
        return this.collection.findOneAndUpdate(query, update, options)
        .then(r => {
            log(`findOneAndUpdate(): r = ${inspect(r)}`);
            return r as A;
        });
    }

    updateOne(query: Filter<A>, updates: UpdateFilter<A>, options: UpdateOptions = {}): Promise<UpdateResult<A>> {
        return this.collection.updateOne(query!, updates, options);
    }

    async* bulkWrite(opsOrSource: AsyncIterable<AnyBulkWriteOperation<A>>, options: Partial<BulkWriterOptions & ProgressOption> = {}): AsyncGenerator<BulkWriteSinkResult<A>> {
        const _options = BulkWriterOptions.mergeDefaults(options);
        if (Array.isArray(opsOrSource)) {
            return [await this.collection.bulkWrite(opsOrSource as AnyBulkWriteOperation<A>[], _options)];
        } else {
            yield* this.bulkWriterSink(_options)(opsOrSource);
        }
    }

    bulkWriterSink(options?: Partial<BulkWriterOptions & ProgressOption>) {//: PipelineSink<AnyBulkWriteOperation<A>, BulkWriteResult, BulkWriteResult[]> {
        const _this = this;
        const _options = BulkWriterOptions.mergeDefaults(options);
        return (async function* bulkWriteSink(source: AsyncIterable<AnyBulkWriteOperation<A>>): AsyncGenerator<BulkWriteSinkResult<A>> {
            for await (const ops of batch({ maxSize: _options.maxBatchSize, timeoutMs: _options.timeoutMs }, source)) {
                log(`bulkWrite(): ops[${ops.length}]=${inspect(ops, { depth: 6, })}`);
                const result = await _this.collection.bulkWrite(ops as AnyBulkWriteOperation<A>[], options);
                log(`bulkWrite(): result=${inspect(result, { depth: 4, })}`);
                yield ({ ops, result });
            }
        });
    };

    bulkWriterStore(options: BulkWriterOptions & BulkWriteOptions & ProgressOption): BulkWriterStore<A> {
        return ({
            ...this,
            bulkWriterSink: this.bulkWriterSink.bind(this),
            bulkWriterStore: this.bulkWriterStore.bind(this),
            watch: this.watch.bind(this),
        });
    }

    async* watch(query: Filter<A>, options: ChangeStreamOptions & ProgressOption = {}) {
        if (options.progress) {
            options.progress.count = await this.collection.countDocuments(query);
        }
        yield* this.collection.watch([{ $match: query }], options)
            .stream({ transform: r => {
                log(`findOneAndUpdate(): r = ${inspect(r)}`);
                return r as A;
            } });
    }

    ops: BulkOpFnMap<A | Aspect, A> = {
        insertOne: (_, options?) => ({ "insertOne": { document: (isArtefact(_) ? _ : { [_._T]: _ }) as OptionalId<A>, ...options } }),
        updateOne: (_, options = { upsert: true, }) => ({ "updateOne": {
            filter: (hasId(_) ? ({ _id: _._id, }) : _.Query.byUnique()) as Filter<A>,
            update: { $set: !Aspect.is(_) ? _ : _.asArtefact() } as UpdateFilter<A>,
            ...options,
        } }),
        updateMany: (_, update, options = { upsert: true, }) => ({ "updateMany": { filter: _ as Filter<A>, update, ...options } }),
        deleteOne: (_, update, options) => ({ "deleteOne": { filter: _ as Filter<A>, update, ...options } }),
        deleteMany: (_, update, options) => ({ "deleteMany": { filter: _ as Filter<A>, update, ...options } }),
        replaceOne: (_, replacement, options) => ({ "replaceOne": { filter: _ as Filter<A>, replacement, ...options } }),
    };
}
