import * as nodeUtil from "node:util";
import { isDate } from "node:util/types";
import { AnyBulkWriteOperation, BulkWriteOptions, BulkWriteResult, ChangeStream, ChangeStreamOptions, ChangeStreamDocument, ChangeStreamInsertDocument, ChangeStreamUpdateDocument, Collection, CollectionOptions, CountOptions, Db, Document, Filter, FindOneAndUpdateOptions, FindOptions, ModifyResult, MongoClient, MongoClientOptions, MongoError, OrderedBulkOperation, UpdateFilter, UpdateOptions, UpdateResult, WithId } from "mongodb";
import { diff } from "deep-object-diff";
import { Artefact, Aspect, AspectFn, Constructor, isAspect } from "./models";
import { AsyncFunction, buildObjectWithKeys, getKeysOfUndefinedValues } from "./utility";
import { cargo, isAsyncGenerator, pipe } from "./pipeline";
import { get } from "./prop-path";
import { Progress } from "./progress";

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

export const Query = <A extends Artefact>(_: A, path: string): Filter<A> => ({ [path]: get(_, path) }) as Filter<A>;

export const resultToString = (result: UpdateResult | null | undefined) => result === null ? "(null)" : result === undefined ? "(undef)" :
    `{ ack.=${result.acknowledged} modifiedCount=${result.modifiedCount} upsertedId=${result.upsertedId} upsertedCount=${result.upsertedCount} matchedCount=${result.matchedCount} }`;

export function diffDotNotation(original: { [K: string]: any; }, updated?: { [K: string]: any; }): ({ [K: string]: any; }) {
    if (!updated) {
        updated = original;
        original = {};
    }
    const update = diff(original, updated);
    const result = appendSubPropNames(update);
    return result;
    function appendSubPropNames(source: { [K: string]: any; }, result: ({ [K: string]: any; }) = {}, prefix: string = "") {
        for (const K in source) {
            const V = source[K];
            if (V !== null && V !== undefined && typeof V === "function") {
                continue;
            } else if (V !== null && V !== undefined && typeof V === "object" && !isDate(V)) {  //V.prototype !== Date.prototype
                appendSubPropNames(V, result, prefix + K + ".");
            } else {
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

    async store<A extends Artefact>(name: string, options?: CollectionOptions): Promise<Store<A>> {
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

export type ProgressOption = { progress?: Progress; };

export type BulkWriterStore<A extends Artefact> = Store<A>;
export type BulkWriterFn<A extends Artefact> = AsyncFunction<[AsyncGenerator<AnyBulkWriteOperation<A>>], BulkWriteResult>;

export type BulkWriterOptions = BulkWriteOptions & {
    maxBatchSize: number;
    timeoutMs: number;
};
export var BulkWriterOptions = {
    default: {
        maxBatchSize: 10,
        timeoutMs: 200,
    } as BulkWriterOptions,
};

export interface Store<A extends Artefact> {
    count(query: Filter<A>, options?: CountOptions): Promise<number>;
    find(query: Filter<A>, options?: FindOptions & ProgressOption): AsyncGenerator<WithId<A>>;
    findOne(query: Filter<A>, options?: FindOptions): Promise<WithId<A> | null>;
    findOneAndUpdate(query: Filter<A>, update: A, options?: FindOneAndUpdateOptions): Promise<WithId<A> | null>;
    updateOne(query: Filter<A>, update: UpdateFilter<A>, options?: UpdateOptions): Promise<UpdateResult<A> | null>;
    updateOrCreate(artefact: A, query: Filter<A>, options?: UpdateOptions): Promise<UpdateOrCreateResult<A>>;
    bulkWrite(operations: AnyBulkWriteOperation<A>[], options?: BulkWriteOptions & ProgressOption): Promise<BulkWriteResult>;
    bulkWriterFn(options?: BulkWriterOptions & ProgressOption): BulkWriterFn<A>;
    bulkWriterStore(options?: BulkWriterOptions & ProgressOption): BulkWriterStore<A>;
    watch(pipeline?: Filter<A>/* Document[] */, options?: ChangeStreamOptions & ProgressOption): AsyncGenerator<ChangeStreamDocument<A>>;//: ChangeStream<A, ChangeStreamDocument<A>>;
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

    async* find(query: Filter<A>, options: FindOptions & ProgressOption = {}) {
        // for await (const item of this._collection.find(query))
        //     yield item;
        if (options.progress) {
            options.progress.total = await this._collection.countDocuments(query);
        }
        yield* this._collection.find(query, options).map(r => {
            if (options.progress) {
                options.progress.count++;
            }
            return r;
        });
    }

    async findOne(query: Filter<A>, options: FindOptions = {}) {
        return await this._collection.findOne(query, options);
    }

    async findOneAndUpdate(query: Filter<A>, update: UpdateFilter<A>, options: FindOneAndUpdateOptions = {}) {
        return await this._collection.findOneAndUpdate(query, update, options);
    }

    async updateOne(query: Filter<A>, update: UpdateFilter<A>, options: UpdateOptions = {}) {
        console.debug(`updateOne(): query=${nodeUtil.inspect(query)} update=${nodeUtil.inspect(update)} options=${nodeUtil.inspect(options)}`);
        return await this._collection.updateOne(query!, {
            // $set: {
            ...update as any/* TSchema */,
            // _ts: new Date(),
            // }
        }, options);
    }

    async updateOrCreate(artefact: A, query: Filter<A>, options: UpdateOptions = {}): Promise<UpdateOrCreateResult<A>> {
        options = { ...options, upsert: true, ignoreUndefined: true }; //, includeResultMetadata: true, returnDocument: 'after', */ };
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
        // console.log(`dbArtefact=${nodeUtil.inspect(dbArtefact)} dbId=${dbId} query=${nodeUtil.inspect(query)} query2=${nodeUtil.inspect(query2)} dbUpdate=${nodeUtil.inspect(dbUpdate)} result=${nodeUtil.inspect(result)}`);
        return result;
    }

    bulkWrite(opsOrSource: AnyBulkWriteOperation<A>[] | AsyncGenerator<AnyBulkWriteOperation<A>>, options: BulkWriteOptions & BulkWriterOptions & ProgressOption = BulkWriterOptions.default): Promise<BulkWriteResult> {
        return Array.isArray(opsOrSource) ?
            this._collection.bulkWrite(opsOrSource, options) :
            this.bulkWriterFn(options)(opsOrSource);
    }

    bulkWriterFn(options: BulkWriterOptions & BulkWriteOptions & ProgressOption = BulkWriterOptions.default): BulkWriterFn<A> {
        const _this = this;
        return async function bulkWrite(source: AsyncGenerator<AnyBulkWriteOperation<A>>) {
            var result: BulkWriteResult = new BulkWriteResult();
            for await (const ops of cargo(options.maxBatchSize, options.timeoutMs, source)) {
                result = await _this._collection.bulkWrite(ops, options);
            }
            return result;
        }
    };

    bulkWriterStore(options: BulkWriterOptions & BulkWriteOptions & ProgressOption): BulkWriterStore<A> {
        return ({
            count: this.count,
            find: this.find,
            findOne: this.findOne,
            findOneAndUpdate: this.findOneAndUpdate,
            updateOne: this.updateOne,
            updateOrCreate: this.updateOrCreate,
            bulkWrite: this.bulkWrite,
            bulkWriterFn: this.bulkWriterFn.bind(this),
            bulkWriterStore: this.bulkWriterStore.bind(this),
            watch: this.watch.bind(this),
        });
    }

    async* watch(query: Filter<A>/* Document[] = [] */, options: ChangeStreamOptions & ProgressOption = {})/* : Promise<ChangeStream<A, ChangeStreamDocument<A>>> */ {
        if (options.progress) {
            options.progress.count = await this._collection.countDocuments(query);
        }
        /* return */yield* this._collection.watch([{ $match: query }], options);
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
