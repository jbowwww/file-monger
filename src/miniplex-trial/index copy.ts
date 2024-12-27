import { World } from "miniplex-project/packages/core";
import { File, Directory, walk, Unknown, FileSystemEntry, Hash } from "../models/fs";
import * as nodeFs from 'node:fs';
import { calculateHash } from "../file";

// type Entity = { [K in keyof FileSystemEntryTypes]: FileSystemEntryTypes; }[keyof FileSystemEntryTypes];
// type Entity = FileSystemEntryTypes[keyof FileSystemEntryTypes];//File | Directory | Unknown;
// type K = keyof Entity;


// type Entity = {
//   // position: { x: number; y: number; z: number }
//   // velocity?: { x: number; y: number; z: number }
//   // health?: number
//   // paused?: true
//   file?: File;
//   dir?: Directory;
//   unknown?: FileSystemEntry;
// };

export type AspectCtor<A extends Aspect = Aspect> = new (...args: any[]) => A;

export class Aspect {
  
}

export class Artefact extends Map<AspectCtor, Aspect> {
  aspects: Map<string, unknown> = new Map();
  has(aspectCtor: AspectCtor) { return super.has(aspectCtor); }
  get(aspectCtor: AspectCtor) { return super.get(aspectCtor); }
  set(aspect: Aspect) {
    super.set(aspect.constructor as AspectCtor, aspect);
    return this;
  }
}

for await (const fsEntry of walk(".")) {
  const _ = world.add(fsEntry);
}