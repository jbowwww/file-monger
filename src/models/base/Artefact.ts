import { ClassConstructor,/* , Model */ 
Model} from "../base";

import { Directory, File } from "../file";

type ClassDecorator<TClass extends FunctionConstructor> = (
    value: Function & TClass,
    context: {
      kind: 'class';
      name: string | undefined;
      addInitializer(initializer: () => void): void;
    }
  ) => Function | void;

const symbolAspectType = Symbol();
export type AspectClass = FunctionConstructor & { [symbolAspectType]: string };

/*
 * @name:
 *  The name of the model, and the store (mongodb translation: collection) name.
 *  OR pass it a Store instance, 
 * @return:
 *  (Actually not fully sure yet)
 *  A dynamic model class identified by/unique to @name, with functionality for building and configuring that model.
 */
// export abstract class Model {
//   Model()

export const Aspect: ClassDecorator<AspectClass> = (value, { kind, name, addInitializer }) => {
  if (kind !== 'class')
    throw new TypeError(`@Aspect decorator called on non-class ${kind} value '${name}'`);
  value[symbolAspectType] = value.name;
}

// export function Artefact<TArtefact extends { [K in keyof TArtefact]: TArtefact[K] extends ClassConstructor<TArtefact[K]> ? ClassConstructor<TArtefact[K]> : never }>()
    
// //     TArtefact[typeof K] extends Model }>(artefact: TArtefact) {

// // }

// Artefact<{ file: File }>()


export interface ModelOptions {
  name?: string;
};
declare var ModelOptions: {
  default: ModelOptions;
};
ModelOptions.default = {};

type ArtefactSchema = {
  [aspectName: string]: FunctionConstructor;
}
export class Artefact<
  TSchema extends { [K in keyof TSchema]: Partial<Model<TModel>> },
  TModel extends Model<TModel>, // extends Model<infer TModel> ? Model<TModel> }> {
  // TArtefactSchema extends Partial<{ [K in keyof TSchema]: Partial<TModel> }>,
  // TSchemaKeys extends keyof TSchema
> {

  private static _schema: ArtefactSchema = {};

  // decorator factory function for adding model classes to this Artefact type (??!‽!)
  static Model<TAspect extends FunctionConstructor>(options: ModelOptions = ModelOptions.default) {
    return <ClassDecorator<TAspect>>((value, { kind, name, addInitializer }) => {
      const _name = options.name ?? name ?? value.name;
      this._schema[_name] = value;
    });
  }

  public constructor(...instances: TModel[]) {
    const artefact = Object.create(Artefact.prototype);
    for (const instance of instances) {
      Object.assign(artefact, {
        [instance.constructor.name]: instance,  // do i want to make a (deep/shallow) copy of this? it might actually be convenient keeping the same isntance
      });
    }
    return artefact;
  }
      // query: Object.fromEntries(
      //   Object.keys(item.query)
      //     .filter(K => (item.query as any)[K] instanceof Function)
      //     .map(K => ([K, (...args: any[]) => ({
      //       [item.constructor.name]: (item.query as any)[K](...args),
      //     })]))),
    // };
  // }

  static async* stream<
    TSchema extends { [K in keyof TSchema]: Partial<Model<TModel>> },
    TModel extends Model<TModel>
  >(iterable: AsyncIterable<TModel | Error>): AsyncGenerator<Artefact<TSchema, TModel>, void, undefined> {
    for await (const item of iterable) {
      if (item instanceof Error) {
        console.warn(`Warning: Error while Artefact.stream() from iterable=${iterable}: ${item}`);
        // throw item;
        continue;
      }
      yield new Artefact<TSchema, TModel>(...[item]);
    }
  }
}
