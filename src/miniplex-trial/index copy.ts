import { World } from "miniplex-project/packages/core";
import { File, Directory, walk, Unknown, FileSystemEntry, Hash } from "../models/fs";
import * as nodeFs from 'node:fs';
import { calculateHash } from "../file";
import { Filter } from "mongodb";

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
  has(aspectCtor: AspectCtor) { return super.has(aspectCtor); }
  get(aspectCtor: AspectCtor) { return super.get(aspectCtor); }
  add(aspect: Aspect) {
    super.set(aspect.constructor as AspectCtor, aspect);
    return this;
  }
}




export type EntityBase = { _id: string; [K: string]: Aspect; };

export interface Store<T extends EntityBase> {
  findOne<A extends Aspect>(aspect: A, )
  createOrUpdate(match: Filter<T>, update: ): T;
}

const createOrUpdateFileSystemEntries = async <T extends EntityBase>(store: Store<T>, source: AsyncIterable<T>) => {
  for await (const fsEntry of FileSystemEntry.walk(".")) {
    const _ = store.createOrUpdate({
      $or: [{

      }]
    })
    _.add(fsEntry);
  }
}
  
  // pipe(
  //   source, //FileSystemEntry.walk("."),
  //   (fsEntry: T)

  // )