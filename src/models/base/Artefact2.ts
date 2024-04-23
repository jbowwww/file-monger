import { EventEmitter } from "stream";
import { DataProperties } from "../base";

export function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj.hasOwnProperty(Symbol.asyncIterator);
}
export function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj.hasOwnProperty(Symbol.iterator);
}

export interface ClassConstructor<TClass = any, TCtorArgs extends Array<any> = any[]> {
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

export interface Timestamp {
    created: Date;
    updated: Date;
    modified: Date;
}
export class Timestamp {
    public created: Date;
    public updated: Date;
    public modified: Date;
    constructor() {
        this.created = new Date();
        this.updated = this.created;
        this.modified = this.updated;
    }
    update(time: Date) {
        this.updated = time;
    }
}

export type TimestampTreeNode = {
    [K: string | symbol]: Partial<Timestamp> & Partial<TimestampTreeNode>;
};
export type TimestampTree = Timestamp & Partial<TimestampTreeNode>;

const AspectPropertyUpdateEventSymbol = Symbol('An event named by this symbol is emitted when Aspect.update() is called');
export type AspectUpdateEventArgs = { updated: string[], _ts: Date };

const AspectPropertyUpdaterMapSymbol = Symbol('@Aspect.trigger populates a property with this key on the Aspect-derived class prototype with update handler methods and their TriggerMap\'s');
export type TUpdater = (oldPropertyValue: any) => any;
export type TriggerMap/* <TAspect extends Aspect<TAspect>> */ = {
    [K: string]: true | 1 | ((target: any/* TAspect */) => boolean) | ((target: any/* TAspect */) => Promise<boolean>);
};

export interface IAspect {
    _id?: string;
    _ts?: TimestampTree;
    _A?: Artefact;
    _T?: string;
}

export abstract class Aspect<TAspect extends Aspect<TAspect> & { [K: string]: any }> extends EventEmitter implements IAspect {

    static [AspectPropertyUpdaterMapSymbol]: { [K: string]: { updater: TUpdater, triggers: TriggerMap }} = {};

    static PropertyUpdates = /* <
        TAspect extends Aspect<TAspect>,
        TAspectConstructor extends /* ClassConstructor { new (...args: any[]): {} }
    > */(
        aspectCtor: any
    ) => {

        const ctor = class extends aspectCtor {
            constructor(...args: any[]) {
                super(args[0]);
                this.on(
                    AspectPropertyUpdateEventSymbol,
                    async (/* this: TAspect,  */updateEventArgs: AspectUpdateEventArgs) => {
                        this.update( Object.fromEntries(
                            Object.entries(Aspect[AspectPropertyUpdaterMapSymbol])
                            .filter(([propertyKey, { updater, triggers }]) => (
                                updateEventArgs.updated.findIndex(updatedKey => (
                                    Object.entries(triggers).findIndex(([triggerKey, triggerValue]) => (
                                        triggerKey.startsWith(updatedKey) && (
                                        triggerValue === 1 || triggerValue === true || (
                                        triggerValue instanceof Function && triggerValue(this/* [propertyKey] */)))
                                    )) >= 0
                                )) >= 0 ))
                            .map(([propertyKey, { updater, triggers }]) => ([ propertyKey, updater([this/* [propertyKey] */]) ]))
                        ));
                    });
            }
        };
        return ctor as any;
    };

    static PropertyUpdater = /* <
        TAspect extends Aspect<TAspect>,
        TAspectConstructor extends /* ClassConstructor  { new (...args: any[]): {} }, 
        TUpdater extends (oldPropertyValue: any) => any,
        TValue = TUpdater extends (this: TAspect, oldPropertyValue: infer TValue) => infer TValue ? TValue : never,
        // TValue = TUpdater extends (this: TAspect, oldPropertyValue: infer TValue) => infer TReturn ? TValue : never,
    > */(
        updater: TUpdater,
        triggers: TriggerMap,
    ) => (
        aspectCtor: any,
        propertyKey: string,
    ) => {
        Aspect[AspectPropertyUpdaterMapSymbol] ??= {};
        Aspect[AspectPropertyUpdaterMapSymbol][propertyKey] = { updater, triggers };
    };

    public _A?: Artefact;
    public get _T(): string { return this.constructor.name; }
    
    public _id?: string;
    public _ts: TimestampTree;
    
    constructor({ _id, _ts }: { _id?: string, _ts?: TimestampTree }) {
        super();
        this._id = _id ?? undefined;
        this._ts = _ts ?? new Timestamp() as TimestampTree;
    }

    get isNew() { return this._id === null; }
    
    public get query() {
        return ({
            byId: () => ({ _id: this._id }),
        });
    }
    public static query = {
        modifiedAfter: (time: Date) => ({ "_ts.modified": { $gt: time.getTime() } }),
    };

    update(diff: Partial<Aspect<TAspect>>, checkOnly = false): string[] {
        const setIfUpdated = !checkOnly ?
            () => {} :
            (target: any, _ts: TimestampTree, key: string, value: any) => {
                target[key] = value;
                _ts[key] = Object.assign(new Timestamp(), _ts[key]);
            }
        const updated = (function checkAndUpdateValues(target: any, _ts: TimestampTree, next: any): string[] {
            const updated: string[] = [];
            for (const key of Object.keys(next).filter(key => !key.startsWith('_'))) {
                if (target[key] !== next[key]) {
                    if (typeof target[key] === 'object' && typeof next[key] === 'object') {
                        const updatedChildren = checkAndUpdateValues(
                            target[key],
                            (_ts[key] !== undefined ? _ts[key] : _ts[key] = {}) as TimestampTree,
                            next[key]
                        );
                        if (updatedChildren.length > 0) {
                            updated.push(key);
                            updated.push(...updatedChildren.map(childKey => key + "." + childKey));
                            setIfUpdated(target, _ts, key, next[key]);
                        }
                    } else {     
                        updated.push(key);
                        setIfUpdated(target, _ts, key, next[key]);
                    }
                }
            }
            return updated;
        })(this, this._ts, diff);
        this.emit(AspectPropertyUpdateEventSymbol, { updated, _ts: new Date() });
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
                if (!K.startsWith('_') && typeof V !== 'function' && typeof V !== 'symbol') {
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
                // throw instance;
            console.error(`Error!: ${JSON.stringify(instance)}`);
            else
                yield new Artefact().add(instance) as Artefact & TSchema;
        }
    }

}
