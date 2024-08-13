import * as fs from 'node:fs';
import * as mongo from 'mongodb';
import { calculateHash } from '../file';

export const isBoolean = (obj: any): obj is boolean => typeof obj === 'boolean';
export const isFunction = (obj: any): obj is Function => typeof obj === 'function';

class TimestampedValue<T> {
    updateTime: Date = new Date();
    createTime: Date = new Date();
    modifyTime: Date = new Date();
    constructor(private value: T) {}
    valueOf() { return this.value; }
    get updateElapsed() { return new Date(Date.now() - this.updateTime.valueOf()); }
    get createElapsed() { return new Date(Date.now() - this.createTime.valueOf()); }
    get modifyElapsed() { return new Date(Date.now() - this.modifyTime.valueOf()); }
}

interface ComparableValue<T> {
    equals(other: T): boolean;
}

class Stats extends fs.Stats implements ComparableValue<fs.Stats> {
 
    constructor(value: Stats | fs.Stats) {
        super();
        Object.assign(this, value);
    }

    equals(other: fs.Stats) {
        return (
            this.atimeMs === other.atimeMs &&
            this.birthtimeMs === other.birthtimeMs &&
            this.blksize === other.blksize &&
            this.blocks === other.blocks &&
            this.ctimeMs === other.ctimeMs &&
            this.dev === other.dev &&
            this.gid === other.gid &&
            this.ino === other.ino &&
            this.mode === other.mode &&
            this.mtimeMs === other.mtimeMs &&
            this.nlink === other.nlink &&
            this.rdev === other.rdev &&
            this.size === other.size &&
            this.uid === other.uid
        );
    }

}

class Timestamp {
    createTime: Date;
    updateTime: Date;
    modifyTime: Date;
    constructor() {
        this.createTime = 
        this.updateTime =
        this.modifyTime = new Date();
    }
    get createElapsed() { return new Date(Date.now() - this.createTime.getTime()); }
    get updateElapsed() { return new Date(Date.now() - this.updateTime.getTime()); }
    get modifyElapsed() { return new Date(Date.now() - this.modifyTime.getTime()); }
}

type Aspect<T, TTimeStamped> = {
    [K in keyof (T & TTimeStamped)]: (T & TTimeStamped)[K];
 } & {
    _ts: { [K in keyof TTimeStamped]: Timestamp | undefined; };
};

type TypeFunction = (...args: any[]) => any;

type AspectSchema = {
    [K: string]: AspectPropertySchema;
};
type AspectPropertySchema = {
    type: TypeFunction;
    timestamps: boolean | AspectPropertyTimestampsSchema;
};
type AspectPropertyTimestampsSchema = {
    create: boolean;
    update: boolean;
    modify: boolean;
};
type TimestampedProperties/* <T extends AspectSchema> */ = {
    // [K in keyof T]: T[K]["timestamps"] extends true ? Timestamp : T[K]["timestamps"] extends AspectPropertyTimestampsSchema ? Timestamp : never;
    [K: string]: Timestamp;
};

export const Aspect = {
    Model<TAspect extends AspectSchema>(schema: TAspect): TypeFunction {
        type AspectData = {
            [K: string /* in keyof TAspect */]: any;//ReturnType<TAspect[K]["type"]>;
        };
        type AspectDataTimestamps = {
            _ts: TimestampedProperties/* <TAspect> */;
        };
        type AspectModel = AspectData & AspectDataTimestamps;
        return (aspectData: AspectData): AspectModel => {
            const aspectPrototype = { _ts: {} as TimestampedProperties/* <TAspect> */ } as AspectModel;
            Object.defineProperties(
                aspectPrototype,
                Object.fromEntries( Object.entries(schema).map/* <[keyof AspectData, any]> */(([K, V]/* : [keyof AspectData, any] */) => ([ K, ({
                    writable: true,
                    enumerable: true,
                    .../* ( */V.timestamps/*  && V.timestamps === 'object') */ ? ({
                        get: function(this: AspectModel) { return this[K]; },
                        set: function(this: AspectModel, value: any) { this._ts[K] = new Timestamp(); this[K] = value; },
                    }) : ({
                        value: V,
                    })
                }) ]), ) )
            );
            const aspect = Object.assign(
                aspectPrototype,
                aspectData
            ) as AspectModel;
            return aspect;
        };
    }
};

const makeAspectFn = <T, TTimeStamped, TOptions>(
    timestampedProperties: [keyof TTimeStamped],
    aspectFn: (obj: Aspect<T, TTimeStamped>, options: TOptions) => Promise<T & TTimeStamped>
) => {

    type TAll = T & TTimeStamped;

    const aspectClass = class {
        constructor(aspect: any) {
            Object.assign(this, aspect);
            this._ts = Object.fromEntries(
                timestampedProperties.map(
                    timestampedPropertyName => ([timestampedPropertyName, new Timestamp()])
                ));
        }
        _ts: { [K: string/*  in keyof TTimeStamped */]: Timestamp | undefined; };
        // [K: keyof T]: T[typeof K];
        // [K: keyof TTimeStamped]: (() => TTimeStamped[typeof K]);
    };
    Object.defineProperties(
        aspectClass.prototype,
        Object.fromEntries(timestampedProperties.map(timestampedPropertyName => ([timestampedPropertyName, {
            writable: true,
            enumerable: true,
            get: function() { return (this as any)['_' + (timestampedPropertyName as string)]; },
            set(value: any) {
                (this as any)._ts['_' + (timestampedPropertyName as string)] = new Timestamp();
                (this as any)['_' + (timestampedPropertyName as string)] = value;
            },
        }])))
    );

    type Ctor<T> = { new(aspectData?: TAll): any };

    return async function(aspectData: TAll, options: TOptions): Promise<TAll> {
        const aspect = aspectData instanceof aspectClass ? aspectData : new aspectClass(aspectData);
        return await aspectFn(aspect as Aspect<T, TTimeStamped>, options);
    };

};

type FilePath = { path: string; };
type FileStats = { stats: Stats };// & { equals(other: fs.Stats): boolean; } };
type FileHash = { hash: string; };// TimestampedValue<string>; };// _hash: string | undefined; set hash(value: string); get hash(); }// TimestampedValue<string>; };
type File = Aspect<FilePath & FileStats, Partial<FileHash>>;

export const isFilePath = (obj: any): obj is File => obj.path !== undefined && !obj.stats;
export const isFile = (obj: any): obj is File => obj.stats !== undefined;
export const isHashedFile = (obj: any): obj is FileHash => obj.hash !== undefined;

type FileSystemPluginOptions = {
    storage: StorageOptions;
    file: FileOptions;
};

type StorageOptions = {
    collection?: mongo.Collection<File>;
};
declare var StorageOptions: { default: StorageOptions; };
StorageOptions.default = {
};

type FileOptions = {
    hashFn?: (file: File, dbFile: File | undefined, fileOptions: FileOptions) => Promise<string | undefined>;
};
declare var FileOptions: { default: FileOptions; };
FileOptions.default = {
    hashFn: async (file, dbFile, fileOptions) =>
        dbFile && file.stats.equals(dbFile.stats) &&
        (dbFile._ts.hash?.updateElapsed ?? 0) < new Date(0, 0, 0, 12, 0, 0, 0)
     ?  dbFile.hash
     :  (file.stats?.size ?? 0) > 1024
     ? await calculateHash(file.path)
     : undefined,
};

// Supply plugin with a storage collection to operate on and other options
export default (pluginOptions: FileSystemPluginOptions = { storage: StorageOptions.default, file: FileOptions.default }) => {

    const defaultOptions: FileSystemPluginOptions = { storage: { ...StorageOptions.default, ...pluginOptions.storage }, file: { ...FileOptions.default, ...pluginOptions.file } };

    // Each function in a plugin can return a data object (e.g. File or Directory) (POJO for now..) or a generator/iterator (e.g Iterate())
    // These functions can be used to create new data objects (e.g. a new File object describing the file at a path),
    // or can be used to retrieve & hydrate documents from storage. Data objects loaded from storage will have an _id field.
    // File or Directory given a path
    const Entry = makeAspectFn<
        FilePath & FileStats,
        Partial<FileHash>,
        FileSystemPluginOptions
    >(
        ['hash'],
        async (file: File, options = defaultOptions) => {

            const dbFile = await options.storage.collection?.findOne({ path: file.path });

            file.stats ??= new Stats(await fs.promises.stat(file.path));
            file.hash = await options.file.hashFn?.(file, dbFile ?? undefined, options.file);
            
            return file;
        }
    );

}