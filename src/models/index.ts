import { isPromise } from "util/types";
import { db } from "./db";
import * as FileSystem from "./file-system";
// import { set } from "../prop-path";
import { diff } from "deep-object-diff";

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;
export type DiscriminatedModel<T extends Record<K, T[keyof T]>, K extends PropertyKey/* keyof T */ = "_T"> = { [V in T[keyof T]]: DiscriminateUnion<T, K, V> };

export type Aspect = { _T: string; };
export const isAspect = (aspect: any): aspect is Aspect => !!aspect && typeof aspect === "object" && typeof aspect._T === "string";

export type ArtefactData = { _id?: string; } & { [K: string]: Aspect; };
// export const Artefact = (...aspects: Aspect[]) => Object.assign({}, aspects.map(a => ({ [a._T]: a })));

export class Artefact extends Map<string, Aspect | Promise<Aspect>> {
    _id?: string;
    constructor(...artefactOrAspects: [Artefact] | Aspect[]) {
        if (artefactOrAspects.length === 1 && isArtefact(artefactOrAspects[0])) {
            const _ = artefactOrAspects[0];
            super();
            this._id = _._id;
            Object.entries(_).forEach(([_T, a]) => {
                // set(this, _T, a);
                this.add(_T, a);
            });
        } else {
            artefactOrAspects.forEach(a => this.add(a as Aspect));
        }
    }
    add(aspectOrName: string | Aspect, aspect?: Aspect) {
        if (typeof aspectOrName === "string" && !!aspect) {
            super.set(aspectOrName, aspect);
        } else if (isAspect(aspectOrName)) {
            super.set(aspectOrName._T, aspectOrName);
        } else {
            throw new TypeError(`Artefact.add(): aspectOrName=${aspectOrName} aspect=${aspect}`);
        }
    }
    delete(aspect: string | Aspect) {
        return super.delete(isAspect(aspect) ? aspect._T : aspect);
    }
    toData() {
        return Object.fromEntries(super.entries().filter(([_T, a]) => !isPromise(a)));
    }
    async* streamData(prevState?: ArtefactData, yieldResolvedDataFirst: boolean = true) {
        if (yieldResolvedDataFirst) {
            yield prevState ? this.diff(prevState) : this.toData();
        }
        let pendingData: Array<Promise<Aspect>>;
        do {
            pendingData = super.entries().filter(([_T, a]) => isPromise(a)).toArray().map(([_T, a], index, arr) =>
                (a as Promise<Aspect>).then(a => {
                    super.set(_T, a);
                    arr.splice(index, 1);
                    return a;
                }));
            const a = await Promise.race(pendingData);
            const update = ({ [a._T]: a });
            yield update;
        } while (pendingData.length > 0);
    }
    static async* stream(source: AsyncIterable<Aspect>) {
        for await (const aspect of source) {
            yield new Artefact(aspect);
        }
    }
    diff(prevState: ArtefactData) {
        return diff(prevState, this);
    }
}
export const isArtefact = (a: any): a is Artefact => a instanceof Artefact;

type FileArtefact = DiscriminatedModel<FileSystem.File | FileSystem.Directory | FileSystem.Unknown>;

for await (const _ of Artefact.stream(FileSystem.walk({ path: "./" }))) {
    
}

async function main() {
    db.configure(() => new db.MongoStorage("mongodb://mongo:mongo@localhost:27017/"));
    const store = await db.store<FileArtefact>(FileArtefact, "fileSystemEntries");
    for await (const fsEntry of FileArtefact.stream(FileSystem.walk({ path: "./" }))) {
        const dbEntry = await store.findOne;
        if (!dbEntry.hash) {

        }
    }
}

main();
