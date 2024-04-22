import { EventEmitter } from "stream";
import { DataProperties } from "../base";

export function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj.hasOwnProperty(Symbol.asyncIterator);
}
export function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj.hasOwnProperty(Symbol.iterator);
}

export interface ClassConstructor<TClass, TCtorArgs extends Array<any> = [TClass]> {
    new (...args: TCtorArgs): TClass;
};

export type AspectData<TData = any> = {
    [K in keyof TData]: any;
};
export type AspectConstructor<TAspect extends Aspect<TAspect>> = ClassConstructor<Aspect<TAspect>, [DataProperties<Aspect<TAspect>>]>;

export type ArtefactData<TData extends { [K: string]: AspectData<TData[typeof K]> }> = {
    [K in keyof TData]: AspectData<TData[K]>;
};
export type ArtefactSchema<TSchema> = { [K in keyof TSchema]: Aspect<any>; };

export class Timestamp {
    public created: Date;
    public updated: Date;
    public modified: Date;
    constructor() {
        this.created = new Date();
        this.updated = this.created;
        this.modified = this.updated;
    }
}

export type TimestampTreeNode = {
    [K: string |  symbol]: Date | TimestampTreeNode; 
};

export type TimestampTree = Timestamp & TimestampTreeNode;

export type AspectUpdateEventArgs = { updated: string[], _ts: Date };

export abstract class Aspect<TAspect extends Aspect<TAspect> & { [K: string]: any }> extends (EventEmitter) {

    static updateSymbol = Symbol('An event named by this symbol is emitted when Aspect.update() is called');

    public _A?: Artefact;
    public get _T(): string { return this.constructor.name; }
    
    public _id?: string;// InferIdType<this>;
    public _ts: Timestamp & TimestampTreeNode;
    
    constructor({ _id, _ts }: { _id?: string, _ts?: Timestamp & TimestampTreeNode }) {
        super();
        this._id = _id ?? undefined;
        this._ts = _ts ?? new Timestamp() as Timestamp & TimestampTreeNode;
        // this.query = {
        //     byId: () => ({ _id: this._id }),
        // };
    }

    get isNew() { return this._id === null; }
    
    public get query() {
        return ({
            byId: () => ({ _id: this._id }),
        });
    }
    //: { [K: string]: (...args: any[]) => any };
    public static query = {
        modifiedAfter: (time: Date) => ({ "_ts.modified": { $gt: time.getTime() } }),
    };

    update(newData: this): string[] {
        const updated = (function checkUpdateValues(prev: any, next: any): string[] {
            const updated: string[] = [];
            for (const key of Object.keys(prev)) {
                if (typeof prev[key] === 'object') {
                    const updatedChildren = checkUpdateValues(prev[key], next[key]);
                    if (updatedChildren.length > 0) {
                        updated.push(key);
                        updated.push(...updatedChildren.map(childKey => key + "." + childKey));
                    }
                }
                else {
                    if (prev[key] !== next[key])
                        updated.push(key);
                }
            }
            return updated;
        })(this, newData);
        this.emit(Aspect.updateSymbol, { updated, _ts: new Date() });
        return updated;
    }

}
/* 
export function mapObject<S extends object, T extends object>(source: S): T {
    return Object.fromEntries(
        Object.entries(source)
            .filter(([K, V]) => typeof V !== 'symbol' && typeof V !== 'function')
            .filter(([K, V]) => target[K] !== V)
        .map(([K, V]) => ([K, V !== null && typeof V === 'object' ? mapObject(V) : V]))
}
 */
export class Artefact {

    _T: {
        primary?: ClassConstructor<Aspect<any>>,
        primaryName?: string,
    } & {
        [K: string]: ClassConstructor<Aspect<any>>,
    } = {};

    [K: string]: AspectData<any>;

    // public get primaryAspectName() { return this._T.primary?.name ?? ""; }

    public get query() {
        return ({
            byPrimary: () => this[this._T.primaryName ?? ""].query.findOne(),
        });
    }
    
    constructor(artefact?: Artefact | null) {
        if (artefact !== undefined && artefact !== null)
            Object.assign(this, artefact);
    }
    
    update(artefact: Artefact) {
        (function testAndAssign(target: any, source: any): string[] {
            const objectModifiedKeys = [];
            const modifiedKeys = [];
            for (const K in source) {
                const V = source[K];
                if (typeof V !== 'function' && typeof V !== 'symbol') {
                    if (typeof V === 'object') {
                        const subModifiedKeys = testAndAssign(target[K] = {}, V).map(k => K + '.' + k);
                        if (subModifiedKeys.length > 0) {
                            objectModifiedKeys.push(...subModifiedKeys);
                            modifiedKeys.push(K);
                        }
                    } else if (target[K] !== V) {
                        modifiedKeys.push(K);
                        target[K] = V;
                    }
                }
            }
            return modifiedKeys.concat(objectModifiedKeys);
        })({}, artefact);
    }

    add(...instances: InstanceType<ClassConstructor<Aspect<any>>>[]): Artefact {
        return Object.assign(
            this,
            ...instances.map((instance, index) => ({
                _T: {
                    ...(index === 0 ? {
                        primary: instance.constructor,
                        primaryName: instance.constructor.name
                    } : { }),
                    [instance.constructor.name]: instance.constructor,
                },
                ...(index === 0 ? { primary: instance } : { }),
                [instance.constructor.name]: Object.assign(instance, { _A: this }),
            }))
        );
    }

    async* absorb(
        input: AsyncIterable<InstanceType<ClassConstructor<Aspect<any>>>> |
            Iterable<InstanceType<ClassConstructor<Aspect<any>>>> |
            AsyncGenerator<InstanceType<ClassConstructor<Aspect<any>>>>
    ) {
        if (isAsyncIterable(input)) {
            for await (const instance of input) {
                yield this.add(instance);
            }
        } else if (isIterable(input)) {
            for (const instance of input) {
                yield this.add(instance);
            }
        }
        return this;
    }

    static async* stream<TSchema>(
        iterable: AsyncIterable<InstanceType<ClassConstructor<Aspect<any>>> | Error> | AsyncGenerator<InstanceType<ClassConstructor<Aspect<any>>> | Error>
    ) {
        for await (const instance of iterable) {
            if (instance instanceof Error)
                throw instance;
            else
                yield new Artefact().add(instance) as Artefact & TSchema;
        }
    }

}
