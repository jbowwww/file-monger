import { World } from "miniplex-project/packages/core";
import { File, Directory, walk, Unknown, FileSystemEntry, Hash } from "../models/fs";
import * as nodeFs from 'node:fs';
import { calculateHash } from "../fs";

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

export type AspectFn<I = any, T = unknown> = (init: I) => T;

export class Artefact {
  aspects: Map<string, unknown> = new Map();
  constructor(primaryAspectName: string, primaryAspect: unknown) {
    this.aspect(primaryAspectName, primaryAspect);
  }
  aspect(aspectName: string, aspect: unknown) {

  }
}

export const Artefact_ = {
  file: File,
  directory: Directory,
  unknown: Unknown,
};

export type ArtefactType = {
  file: File,
  directory: Directory,
  unknown: Unknown,
};
export type PipelineFn<T extends {}, R extends {}> = (input: T) => R | Promise<R>;
// export const pipe = <T extends {} = {}, R extends {} = {}>(pipeFn: PipelineFn<T, R>) => {
//   const fn = (input: T) => pipeFn(input);
//   return Object.assign(fn, {
//     add<R extends {}, R2 extends {}>(pipeFn: PipelineFn<R, R2>) { return pipe<R, R2>(pipeFn); },
//   });
// };
export const ArtefactPipeline = <T extends {} = {}, R extends {} = {}>(pipeFn: PipelineFn<T, R>) => {
  const fn = async (input: T) => await pipeFn(input);
  return Object.assign(fn, {
    async enhance<R2 extends {}>(pipeFn: PipelineFn<R, R2>) { return ArtefactPipeline<T, R2>(async (input: T) => pipeFn(await fn(input))); },
  });
};

export const Artefact__ =
   ArtefactPipeline(FileSystemEntry)
  .enhance(Hash)
  

// export const Artefact__ = pipeline(
//   async (path: string) => {
//     const stats = await nodeFs.promises.lstat(path);
//     return stats.isFile() ? ({
//       file: { path, stats }
//     }) : stats.isDirectory() ? ({
//       directory: { path, stats }
//     }) : ({
//       unknown: { path, stats }
//     });
//   },
//   async ({ file?, hash? }/* : { file: string, hash?: string } */) => {
//     (file && (!hash || (Date.now() - hash._ts) > 3600000)) && ({ hash: await calculateHash(file.path) })
//   }

// type Entity = {
  // position: { x: number; y: number; z: number }
  // velocity?: { x: number; y: number; z: number }
  // health?: number
//   // paused?: true
//   file: File,
//   dir: Directory,
//   unknown: FileSystemEntry,
// };

const world = new World<Entity>();

const newFiles = world.with("file").without("dir").without("unknown")
for await (const fsEntry of walk(".")) {
  const _ = world.add(fsEntry);
}