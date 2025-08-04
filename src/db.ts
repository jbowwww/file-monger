import * as nodePath from "node:path";
import mongo, { AnyBulkWriteOperation, BulkWriteOptions, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Filter, FindOneAndUpdateOptions, FindOptions, MongoClient, UpdateFilter, UpdateOptions, UpdateResult, IndexSpecification, CreateIndexesOptions, Condition, InsertOneModel, DeleteManyModel, DeleteOneModel, ReplaceOneModel, UpdateManyModel, UpdateOneModel, BSON, DeleteOptions, ReplaceOptions, InsertOneOptions, OptionalId, WithoutId, FindCursor, FilterOperators } from "mongodb";
import { Artefact, ArtefactQueryFn, hasId, isArtefact } from "./models/artefact";
import { Aspect, DeepProps, Choose, Constructor, isConstructor, ValueUnion, makeDefaultOptions, isNonDateObject, ProgressOption, AsyncGeneratorFunction, Function, makeFunction, AnyParameters, isString, isAspectTypeOrName, AspectClassOrName, isAspectType, omitFromObject } from "./models/";
import { PipelineGeneratorStage, PipelineSink, PipelineSourceLengthWrapped, batch, wrapPipelineSourceWithLength } from "./pipeline";

import { inspect } from "node:util";
import debug from "debug";
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
            byUnique: (_: Artefact) => ({ "_id": _._id, }),
        },
    },
};

export type CreateIndexArgs = {
    index: IndexSpecification;
    options?: CreateIndexesOptions;
};

// This is a function and not a class specifically because I want Query syntax to be as terse as possible
// When importing can also import like "Query as Q" and query expressions then become Q.and(Q(FS.File).exists(false), ...)
export function Query /* = Object.assign( */
<A extends Aspect, P extends DeepProps<A>/* , T extends Choose<A, P> = Choose<A, P> */>(aspectTypeOrPrefix: AspectClassOrName<A>/* | string */, propPath?: P)/*  => */ {
    const fqPropPath = aspectTypeOrPrefix &&
        (isString(aspectTypeOrPrefix) ? (aspectTypeOrPrefix + (propPath ? "." + propPath : "")) :
            (/* isAspectType(aspectTypeOrPrefix) ? */ (aspectTypeOrPrefix._T ?? aspectTypeOrPrefix.name) + (propPath ? "." + propPath : "")));
    const op = <T extends Choose<A, P> = Choose<A, P>>(op: keyof FilterOperators<A>) =>
            (value: T) => ({ [fqPropPath]: { [op/* `\$${op}` */]: value } });
    return ({
        exists: (exists: boolean = true) => ({ [fqPropPath]: { _T: isAspectType(aspectTypeOrPrefix) ? aspectTypeOrPrefix._T : aspectTypeOrPrefix, } }),//{ $exists: exists } }),
        equals: op("$eq"),//(value: Choose<A, typeof fqPropPath>) => ({ [fqPropPath]: { $eq: value } }),
        gt: op("$gt"),//(value: Choose<A, typeof fqPropPath>) => ({ [fqPropPath]: { $gt: value } }),
        gte: op("$gte"),//(value: Choose<A, typeof fqPropPath>) => ({ [fqPropPath]: { $gte: value } }),
        lt: op("$lt"),//(value: Choose<A, typeof fqPropPath>) => ({ [fqPropPath]: { $lt: value } }),
        lte: op("$lte"),//(value: Choose<A, typeof fqPropPath>) => ({ [fqPropPath]: { $lte: value } }),
        in: op("$in"),//(value: Choose<A, typeof fqPropPath>[]) => ({ [fqPropPath]: { $in: value } }),
        nin: op("$nin"),//(value: Choose<A, typeof fqPropPath>[]) => ({ [fqPropPath]: { $nin: value } }),
    });
}
export namespace Query {
    export type Expression = `\$${string}`;
    export const and = <A extends Aspect, P extends DeepProps<A>>(...conditions: { [K: string]: Filter<A> }[]) => ({ $and: conditions });
    export const or = <A extends Aspect, P extends DeepProps<A>>(...conditions: { [K: string]: Filter<A> }[]) => ({ $or: conditions });
    export const expr = {
        gt: (operand1: Query.Expression, operand2: Query.Expression) => ({ $expr: { $gt: [ operand1, operand2 ] } }),
        gte: (operand1: Query.Expression, operand2: Query.Expression) => ({ $expr: { $gte: [ operand1, operand2 ] } }),
        lt: (operand1: Query.Expression, operand2: Query.Expression) => ({ $expr: { $lt: [ operand1, operand2 ] } }),
        lte: (operand1: Query.Expression, operand2: Query.Expression) => ({ $expr: { $lte: [ operand1, operand2 ] } }),
        // in: (operand1: Query.Expression, operand2: Query.Expression) => ({ $expr: { $in: [ operand1, operand2 ] } }),
        // nin: (operand1: Query.Expression, operand2: Query.Expression) => ({ $expr: { $gt: [ operand1, operand2 ] } }),
    };
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
    insertOne(_: T, options?: InsertOneOptions): BulkOp<TOut, "insertOne">;
    updateOne(_: T, options?: UpdateOptions): BulkOp<TOut, "updateOne">;
    updateMany(_: T, options?: UpdateOptions): BulkOp<TOut, "updateMany">;
    deleteOne(_: T, options?: DeleteOptions): BulkOp<TOut, "deleteOne">;
    deleteMany(_: T, options?: DeleteOptions): BulkOp<TOut, "deleteMany">;
    replaceOne(_: T, options?: ReplaceOptions): BulkOp<TOut, "replaceOne">;
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
    find(query: Filter<A>, options?: FindOptions & ProgressOption): PipelineSourceLengthWrapped<A>;
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

    async* find<F extends A = A>(query: Filter<A>, options: FindOptions & ProgressOption = {}): PipelineSourceLengthWrapped<F> {
        const _this = this;
        yield* wrapPipelineSourceWithLength(({ length }: { length?: number; }) =>
            (async function*() {
                if (options.progress || length) {
                    const count = await _this.collection.countDocuments(query);
                    options.progress?.setTotal?.(count);
                    length = count;
                }
                yield* _this.collection.find<F>(query, options).map(r => {
                    if (options.progress) {
                        options.progress?.incrementCount?.();
                    }
                    log(`find(): r = ${inspect(r)}`);
                    return r as F;
                });                
            })());
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
    }

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
            options.progress?.setCount?.(await this.collection.countDocuments(query));
        }
        yield* this.collection.watch([{ $match: query }], options)
            .stream({ transform: r => {
                log(`findOneAndUpdate(): r = ${inspect(r)}`);
                return r as A;
            } });
    }


    // Returns a wrapper function that passes the 'options' argument given to withOptions(), as the last argument to fn, optionally overlaying
    // with the now optional last 'options' argument to the returned function
    makeOp<P extends any[], O extends {}, R extends any/* , O = P extends [...any[], infer O] ? O : never */>(op: BulkOpNames, fn: Function<[...P, O], R>) {
        return Object.assign(makeFunction(op, fn), {
            withOptions(options: O) {
                return makeFunction(
                    op,
                    (...args: [...headArgs: P, overlayedOptions: O]) => fn(...([...args.slice(0, -1) as P, { ...options, ...args.slice(-1), }]))
                );
            }
        });
    }

    ops: BulkOpFnMap<A | Aspect, A> = {
        insertOne: this.makeOp("insertOne", (_: A | Aspect, options: InsertOneOptions = {}) => ({ "insertOne": { document: (isArtefact(_) ? _ : { [_._T]: _ }) as OptionalId<A> , ...options } })),
        updateOne: this.makeOp("updateOne", (_: A | Aspect, options: UpdateOptions = { upsert: true, }) => ({ "updateOne": {
            filter: (hasId(_) ? ({ _id: _._id, }) : _.Query.byUnique()) as Filter<A>,
            update: { $set: !Aspect.is(_) ? _ : _.asArtefact() } as UpdateFilter<A>,
            ...options,
        } })),
        updateMany: this.makeOp("updateMany", (_: A | Aspect, options: UpdateOptions = { upsert: true, }) => ({ "updateMany": {
            filter: (hasId(_) ? ({ _id: _._id, }) : _.Query.byUnique()) as Filter<A>,
            update: { $set: !Aspect.is(_) ? _ : _.asArtefact() } as UpdateFilter<A>,
            ...options,
        } })),
        deleteOne: this.makeOp("deleteOne", (_: A | Aspect, options: DeleteOptions) => ({ "deleteOne": { filter: _ as Filter<A>, ...options } })),
        deleteMany: this.makeOp("deleteMany", (_: A | Aspect, options: DeleteOptions) => ({ "deleteMany": { filter: _ as Filter<A>, ...options } })),
        replaceOne: this.makeOp("replaceOne", (_: A | Aspect, options: ReplaceOptions) => ({ "replaceOne": hasId(_) ?
            ({ filter: ({ _id: _._id, }) as Filter<A>, replacement: _ as WithoutId<A>, ...options }) :
            ({ filter: _.Query.byUnique() as Filter<A>, replacement: omitFromObject(!Aspect.is(_) ? _ : _.asArtefact()) as WithoutId<A>, ...options }),
         }))
    }
}
