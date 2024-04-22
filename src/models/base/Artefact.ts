import { ClassConstructor,/* , Model */ 
Model,
Timestamp} from "../base";

import { Directory, File } from "../file";

type ClassDecorator<TClass extends FunctionConstructor = FunctionConstructor> = (
    value: any,
    context: ClassDecoratorContext
    // {
    //   kind: 'class';
    //   name: string | undefined;
    //   addInitializer(initializer: () => void): void;
    // }
  ) => void;

type ClassPropertyDecorator<TClass extends FunctionConstructor = FunctionConstructor> = (
    value: any,
    // propertyKey: string | symbol,
    context: ClassFieldDecoratorContext,
    // {
    //   kind: 'property';
    //   name: string | undefined;
    //   addInitializer(initializer: () => void): void;
    // }:
  ) => void;

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
};

export const updatedKeys = (oldData: any, newData: any): string[] => {
  const updated = (function checkUpdateValues(prev: any, next: any): string[] {
      const updated: string[] = [];
      for (const key of Object.keys(prev)) {
          if (typeof prev[key] === 'object') {
              const updatedChildren = checkUpdateValues(prev[key], next[key]);
              if (updatedChildren.length > 0) {
                  updated.push(...updatedChildren.map(childKey => key + "." + childKey));
                  updated.push(key);
              }
          }
          else {
              if (prev[key] !== next[key])
                  updated.push(key);
          }
      }
      return updated;
  })(oldData, newData);
  return updated;
}
export const isUpdated = (oldData: any, newData: any) => updatedKeys(oldData, newData).length > 0;

export type TriggerMap = {
  [K: string]: true | 1 | ((oldValue: any, newValue: any) => boolean);
};

export const trigger = (targetUpdater: (...args: any[]) => any, triggerMap: TriggerMap) => {
  return ((target: any, { kind, name, addInitializer }) => {
    
    // if (typeof target !== 'object' || typeof target[symbolAspectType] !== 'string')
    if (kind !== 'field')
      throw new TypeError(`@trigger decorator called on non-property target=${target}`)

    const triggerDescriptors: PropertyDescriptorMap = Object.fromEntries(
      Object.keys(triggerMap).map(triggerPropertyKey => ([
        triggerPropertyKey,
        Object.getOwnPropertyDescriptor(target, triggerPropertyKey)
      ])
    ).filter(descriptor => descriptor !== undefined));

    for (const triggerName in triggerDescriptors) {
      const triggerDescriptor = triggerDescriptors[triggerName];
      triggerDescriptor.get = () => triggerDescriptor.value;
      triggerDescriptor.set = function (value: any) {
        if (isUpdated(triggerDescriptor.value, value)
        && (triggerMap[triggerName] === true || triggerMap[triggerName] === 1)
        || (triggerDescriptor.value, value)) {
          triggerDescriptor.value = value;
          (async () => {
            target[name] = await targetUpdater(target);
          })();
        };
      }
    }
  }) as ClassPropertyDecorator;
};

// export function Artefact<TArtefact extends { [K in keyof TArtefact]: TArtefact[K] extends ClassConstructor<TArtefact[K]> ? ClassConstructor<TArtefact[K]> : never }>()
    
// //     TArtefact[typeof K] extends Model }>(artefact: TArtefact) {

// // }

// Artefact<{ file: File }>()

// export interface ModelOptions {
//   name?: string;
// };
// declare var ModelOptions: {
//   default: ModelOptions;
// };
// ModelOptions.default = {};
  // decorator factory function for adding model classes to this Artefact type (??!‽!)
  // static Model<TAspect extends FunctionConstructor>(options: ModelOptions = ModelOptions.default) {
  //   return <ClassDecorator<TAspect>>((value, { kind, name, addInitializer }) => {
  //     const _name = options.name ?? name ?? value.name;
  //     this._schema[_name] = value;
  //   });
  // }


// export type ArtefactSchemaRoot = {
//   _id?: string;
//   _ts?: Timestamp;
// };
// export type ArtefactSchemaData = {
//   [K: string]: Partial<Model<any>>; //{ [K in keyof TSchema]: Partial<Model<any>> },
// };
// export type Artefact = ArtefactSchemaRoot & ArtefactSchemaData;

// export var Artefact = {

//   prototype: {},  // might come in handy

//   create<TSchema extends ArtefactSchemaData>(...instances: TSchema[]) {
//     return Object.assign(
//       Object.create(Artefact.prototype),
//       ...instances.map(instance => ({
//         [instance.constructor.name]: instance,  // do i want to make a (deep/shallow) copy of this? it might actually be convenient keeping the same isntance
//       }))
//     );
//   },
  
//   async* stream<
//     TSchema extends { [K in keyof TSchema]: Partial<Model<TModel>> },
//     TModel extends Model<TModel>
//   >(iterable: AsyncIterable<TModel | Error>): AsyncGenerator<Artefact<TSchema, TModel>, void, undefined> {
//     for await (const item of iterable) {
//       if (item instanceof Error) {
//         console.warn(`Warning: Error while Artefact.stream() from iterable=${iterable}: ${item}`);
//         // throw item;
//         continue;
//       }
//       yield Artefact.create<TSchema, TModel>(...[item]);
//     }
//   }

// };

// // TypeScript class to define the Artefact
// class Artefact {
//   _schema: Record<string, new (...args: any) => any>;
//   [key: string]: any;

//   constructor(schema: Record<string, new (...args: any) => any>, instances: any) {
//     this._schema = schema;
//     Object.assign(this, instances);
//   }
// }

// // Updated function
// type ClassToObject<T> = {
//   [K in keyof T]: T[K] extends new (...args: any) => any ? InstanceType<T[K]> : T[K];
// };

// function classesToArtefact<T>(...instances: ClassToObject<T>[]): Artefact {
//   const schema: Record<string, new (...args: any) => any> = {};
//   const artefactObj: Record<string, any> = {};

//   instances.forEach((instance) => {
//     const instanceKeys = Object.getOwnPropertyNames(instance);
//     instanceKeys.forEach((key) => {
//       const constructorName = instance[key].constructor.name;
//       schema[constructorName] = instance[key].constructor;
//       artefactObj[constructorName] = instance[key];
//     });
//   });

//   return new Artefact(schema, artefactObj);
// }
