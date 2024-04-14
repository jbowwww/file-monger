import { ClassConstructor, Model } from "./base";

import { File } from "../models/file";

type ClassDecorator = (
    value: Function,
    context: {
      kind: 'class';
      name: string | undefined;
      addInitializer(initializer: () => void): void;
    }
  ) => Function | void;

const symbolAspectType = Symbol();
export type AspectClass = Function & { [symbolAspectType]: string };

function Aspect(value: AspectClass) {
    value[symbolAspectType] = value.name;
}

// export function Artefact<TArtefact extends { [K in keyof TArtefact]: TArtefact[K] extends ClassConstructor<TArtefact[K]> ? ClassConstructor<TArtefact[K]> : never }>()
    
// //     TArtefact[typeof K] extends Model }>(artefact: TArtefact) {

// // }

// Artefact<{ file: File }>()