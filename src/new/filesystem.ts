import { Collection, Db, DBRef, Document } from 'mongodb';
import * as fs from 'node:fs';
import { Artefact } from '../new/Artefact1';

class Aspect {
    __?: Artefact;
    get _() {
        if (this.__ == undefined)
            throw new Error(`Tried to access '_: Artefact' on aspect of type '${this.constructor.name ?? '(unknown)'}' = ${this}`);
        return this.__;
    }

    constructor({ _, ...init }: { _: Artefact; } & unknown) {
        this.__ = _;
    }
    static async create(
        this: typeof Aspect,
        { _, ...init }: { _: Artefact} & unknown
    ): Promise<Aspect>
    {
        return new this({ _, ...init });
    }

    static readonly _collection: Collection;
    static bind<T extends Aspect>(
        collection: Collection,
        aspectClass: { _collection: Collection, new (...args: any): T }    // also works - aspectClass: typeof Aspect
    ): typeof Aspect {
        return class AspectBound extends Aspect {
            static _collection: Collection<Document> = collection;
        };
    }
}

// class Artefact {
//     add<T extends Aspect>(aspectClass: typeof Aspect, init: Omit<T, "_">) {
//         new aspectClass({ _: this, ...init });
//     }
// }

type Data<T> = { [K in keyof T]: T[K] extends Function ? never : T[K] };

export type ArtefactAspectData<
    T extends Aspect,
    K extends keyof T = keyof T
> = RequireOnly<T, K | "_"> & {
    _: Artefact;
};

type RequireOnly<T, K extends keyof T> = Required<Pick<T, K>> & Partial<Omit<T, K>>;

export class FileSystemEntry extends Aspect {

    public readonly path: string;
    public readonly stats: fs.Stats;

    constructor({ _, path, stats }: ArtefactAspectData<FileSystemEntry, "path">) {
        super(_);
        this.path = path;
        this.stats = stats;
    }

    static async create({ _, path, stats }: ArtefactAspectData<FileSystemEntry, "path">): Promise<FileSystemEntry>
    {
        return new this({
            _,
            path,
            stats: stats ?? await fs.promises.lstat(path)
        });
    }
}

export class File extends FileSystemEntry {
    readonly Directory: DBRef
    private constructor(path: string, stats: fs.Stats) {
        super(path, stats);
    }
    static async createFromPath(path: string) {
        return new this(path, await fs.promises.lstat(path));
    }
}
