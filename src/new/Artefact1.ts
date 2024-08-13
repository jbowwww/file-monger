import { Filter } from "mongodb";
import { ArtefactData, ArtefactModelConstructors, Model } from "../models/Model";
import { Artefact } from "../models/export class Artefact {";

export type ClassConstructor<T = any, TArgs = any[]> = new (...args: any[]) => T;

export type Identifiable = { _id?: string; };

export type ArtefactModelConstructors =  { [K: string]: new (...args: any[]) => Model; };
export type ArtefactModels<TCtors extends ArtefactModelConstructors = ArtefactModelConstructors> = {
    [K in keyof TCtors]: InstanceType<TCtors[K]>;
}
export const makeArtefactType = <
    C extends ArtefactModelConstructors,
    D extends ArtefactModels<C> = ArtefactModels<C>,
    A extends Identifiable = Identifiable & Partial<D>,
>(
    models: C
) => {
    function Artefact(this: typeof Artefact, init?: A) {
        if (init !== undefined) {
            for (const [modelName, modelData] of Object.entries(init)) {
                if (init !== undefined) {
                    this.add(modelData);
                }
            }
        }
    }
    

    export type ArtefactInstance = {
        constructor: Function,
        _id?: string,
        get isNew(): boolean,
    };
    // modelMap: Map<keyof A, Model>,
    //     add<M extends Model>(model: M): ArtefactInstance,
    //     get<M extends Model>(modelCtor: new (...args: any[]) => M): ,
    //     toData(options?: any): OptionalId<A>,
    //     save(db: Store<A>): Promise<ArtefactInstance>
    // };

    Artefact.prototype = {
        constructor: Artefact,
        _id?: undefined,
        get isNew(): boolean { return this._id === undefined; },
        // modelMap: new Map<keyof A, Model>,
    } as ArtefactInstance;
        // (modelType: TCtors[keyof TCtors]) => InstanceType<TCtors[keyof TCtors]>
        static newId = () => crypto.randomUUID();    
        static getKey<A extends ArtefactData>(data: Artefact): Filter<Artefact> { return ({ _id: data._id }); }

        
        constructor(artefact?: A) {
            if (artefact !== undefined) {
                for (const [modelName, modelData] of Object.entries(artefact)) {
                    if (artefact !== undefined) {
                        this.add(modelData);
                    }
                }
            }
        }
    
        static createFromModel<M extends A[keyof A]>(model: M) {
            return new Artefact({ [model.constructor.name]: model });
        }
    
        add<M extends Model>(model: M) {
            model._ ??= new ModelMeta({ a: this });
            model._.a = this;
            this.modelMap.set(model.constructor.name, model);
        }
    
        get<M extends Model>(modelCtor: new (...args: any[]) => M) {
            return this.modelMap.get(modelCtor.name) as M;//modelCtor.name);
        }
    
        static async* stream<M extends Model>(iterable: AsyncGenerator<M>) {
            for await (const model of iterable) {
                yield new Artefact({ [model.constructor.name]: model });
            }
        }
    
        toData(options?: any): OptionalId<A> {
            return ({ _id: this._id, ...Object.fromEntries(this.modelMap.entries()) as A });
        }
    
        async save(db: Store<A>) {
            if (this.isNew) {
                this._id = Artefact.newId();
            }
            await db.updateOrCreate(this.toData());
            return this;
        }
    
        static async load<A extends ArtefactData>(db: Store<A>, query: Filter<A>) {
            const artefactData = await db.findOne(query) || undefined;
            return new Artefact(artefactData);
        }
    
        /* todo: query objects */
        static query = {
            findOne<T extends { _id?: string }>({ _id }: { _id?: string }) { return _id !== undefined ? ({ _id }) : ({}); },
            find<T extends { _id?: string }>() { },
            updateOne<T extends { _id?: string }>() { },
            update<T extends { _id?: string }>() { },
    
        }
    
    }

    // const artefactType = class extends Artefact {

    // };

    for (const [modelName, modelCtor] of Object.entries(models)) {
        (Artefact.prototype as any)[modelName] = null;
    }

    // return artefactType;

    return Artefact;
};

    
// abstract class Aspect {
//     static _type: string;
// }

// export type Artefact = {
//     [K: string]: any;
// }
// export type ArtefactSchema = {
//     [K: string]: ClassConstructor<Aspect>;
// }
// export type ArtefactType<TSchema extends ArtefactSchema> = {
//     [K in keyof TSchema]: Aspect;// InstanceType<TSchema[K]>;
// }
// class Artefact {
//     constructor(init: Partial<T>): T {
//     Object.assign(this, Object.fromEntries(Object.entries(init).map(([K, V]) =>
//         ([K, new (schema[K])(Object.assign(V as object, { _: artefact }))])))
    //         );
    //     };
        
    //     Artefact.stream = async function* stream<TA>(source: AsyncIterable<T>): AsyncGenerator<T> {
    //         for await (const item of source) {
    //             yield Artefact(item);
    //         }
    //     }
        
    //     return Artefact;
// export function makeArtefactType<
//     TSchema extends ArtefactSchema,
//     T extends {} = ArtefactType<TSchema> & { _: ArtefactType<TSchema>}
// >(
//     schema: TSchema
// ) {
//     function Artefact(init: Partial<T>): T {
//         const artefact = {} as T;
//         return Object.assign(
//             artefact,
//             Object.fromEntries(Object.entries(init).map(([K, V]) => ([K, new (schema[K])(Object.assign(V as object, { _: artefact }))])))
//         );
//     };
    
//     Artefact.stream = async function* stream<TA>(source: AsyncIterable<T>): AsyncGenerator<T> {
//         for await (const item of source) {
//             yield Artefact(item);
//         }
//     }
    
//     return Artefact;
// }
