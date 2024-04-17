import { ClassConstructor/* , Model */ } from "../base";

import { File } from "../file";

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
export abstract class Artefact {

  private static _schema: ArtefactSchema = {};

  // decorator factory function for adding model classes to this Artefact type (??!‽!)
  static Model<TAspect extends FunctionConstructor>(options: ModelOptions = ModelOptions.default) {
    return <ClassDecorator<TAspect>>((value, { kind, name, addInitializer }) => {
      const _name = options.name ?? name ?? value.name;
      this._schema[_name] = value;
    });
  }

}
