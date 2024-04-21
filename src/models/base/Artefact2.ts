
export function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj.hasOwnProperty(Symbol.asyncIterator);
}
export function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj.hasOwnProperty(Symbol.iterator);
}
// export function isArtefactAspects<T extends ArtefactAspects<T>>(obj: any): obj is ArtefactAspects<T> {
//     return typeof obj === 'object'; // literally each input item is really just a POJO (a class will also have prototype and ctor though)
// }

export interface ClassConstructor<TClass, TCtorArgs extends Array<any> = [TClass]> {
    new (...args: TCtorArgs): TClass;
};

export type ArtefactAspect<T> = (T extends new (...args: any[]) => any ? InstanceType<T> : T)
    | Promise<any>
    | ((...args: any[]) => any)
    | ((...args: any[]) => Promise<any>)
//     | object;

// export type ArtefactAspects<T> = {
//     [K in keyof T]: (T[K] extends new (...args: any[]) => any ? InstanceType<T[K]> : T[K]) | undefined;
// };

export type AspectData<TData = any> = {
    [K in keyof TData]: any;
};

// export abstract class Aspect<TAspectData extends AspectData, K extends string> {
    // [K: keyof TAspectData]: TAspectData[typeof k];
    // constructor(data: TAspectData) {
//         Object.assign(this, dat

// export type AspectConstructor<TAspectData extends AspectData> = ClassConstructor<Aspect<TAspectData>, [TAspectData]>;


export type ArtefactData<TData extends { [K: string]: AspectData<TData[typeof K]> }> = {
    [K in keyof TData]: AspectData<TData[K]>;
};

// export type ArtefactSchema = { [K: string]: AspectConstructor<AspectData>; };

// export class Artefact<TSchema extends ArtefactSchema, K extends keyof TSchema> {
//     [K: keyof TSchema]: InstanceType<TSchema[typeof K]> | undefined;
//     constructor(...instances: AspectData[]) {}
// }

// export type ArtefactType<TSchema extends ArtefactSchema> = {
//     new (...instances: InstanceType<TSchema[keyof TSchema]>[]): ArtefactType<TSchema>;
// };// & Artefact<TSchema>;

// declare var Artefact: {
//     Type: <TSchema extends ArtefactSchema>(schema: TSchema) => ArtefactType<TSchema>;
// } = {
//     Type: <TSchema extends ArtefactSchema>(schema: TSchema) => {
//         return class implements ArtefactType<TSchema> {
//             constructor(...instances: ArtefactType<TSchema>[]) {
//                 return Object.assign(this, instances);//Object.fromEntries(aspects.map(aspect => new schema[aspect.prototype.constructor.name](aspect)([aspect.name, new aspect()])))
//             }
//         };
//     };
//         for (const key in schema) {
//             artefactType.prototype[key] = 
//         }
// });

// Artefact.Type = ()
// Artefact.prototype = {
    
//     _schema: undefined,

//     constructor: Artefact,
//     add<T>(...instances: ArtefactAspect<T>[]): Artefact {
//         for (const instance of instances) {
//             const constructorName = instance[key].constructor.name;
//             this._schema[constructorName] = instance[key].constructor;
//             this[constructorName] = instance[key];
//         }
//         return this;
//     },

//     // Absorbs all the input items into one Artefact.
//     // Yields this same Artefact instance each time it absorbs another item,
//     // but this can be ignored and just await the final result if wanted.
//     async* absorb<T>(input: AsyncIterable<ArtefactAspect<T>> | Iterable<ArtefactAspect<T>> | AsyncGenerator<ArtefactAspect<T>>) {
//         if (isAsyncIterable(input)) {
//             for await (const instance of input) {
//                 yield this.add(instance);
//             }
//         } else if (isIterable(input)) {
//             for (const instance of input) {
//                 yield this.add(instance);
//             }
//         }
//         return this;
//     },

//     async* stream<T extends { [K: string]: any }>(iterable: AsyncIterable<ArtefactAspect<T>> | AsyncGenerator<ArtefactAspect<T>>) {
//         for await (const instance of iterable) {
//             yield Artefact(instance) as Artefact<Partial<T>>;
//         }
//     }

// };

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

export abstract class Aspect {

    public get _T(): string { return this.constructor.name; }
    
    public _id?: string;// InferIdType<this>;
    public _ts?: Timestamp;
    
    constructor({ _id, _ts }: { _id?: string, _ts?: Timestamp }) {
        this._id = _id ?? undefined;
        this._ts = _ts ?? new Timestamp();
    }

    get isNew() { return this._id === null; }
    
    query = ((_this: this = this) => ({
        get _id(): any { return ({ _id: _this._id }); },
    }))();
    
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
        return updated;
    }

}


export class Artefact/* <T extends { [K: string]: Aspect } = {}> */ {

    _T: {
        primary?: ClassConstructor<Aspect>,
    } & {
        [K: string]: ClassConstructor<Aspect>,
    } = {};

    primary?: Aspect;

    static create(artefact: { [K: string]: Aspect }) {

    }

    constructor(...instances: InstanceType<ClassConstructor<Aspect>>[]) {
        Object.assign(
            this,
            ...instances.map((instance, index) => ({
                _T: {
                    ...(index === 0 ? { primary: instance.constructor } : { }),
                    [instance.constructor.name]: instance.constructor,
                },
                ...(index === 0 ? { primary: instance } : { }),
                [instance.constructor.name]: instance,
            }))
        );
    }
    
    add(...instances: InstanceType<ClassConstructor<Aspect>>[]): Artefact {
        return Object.assign(
            this,
            ...instances.map((instance, index) => ({
                _T: {
                    ...(index === 0 ? { primary: instance.constructor } : { }),
                    [instance.constructor.name]: instance.constructor,
                },
                ...(index === 0 ? { primary: instance } : { }),
                [instance.constructor.name]: instance,
            }))
        );
    }

    async* absorb(input: AsyncIterable<InstanceType<ClassConstructor<Aspect>>> | Iterable<InstanceType<ClassConstructor<Aspect>>> | AsyncGenerator<InstanceType<ClassConstructor<Aspect>>>) {
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

    static async* stream(iterable: AsyncIterable<InstanceType<ClassConstructor<Aspect>>> | AsyncGenerator<InstanceType<ClassConstructor<Aspect>>>) {
        for await (const instance of iterable) {
            yield new Artefact(instance);
        }
    }

}
