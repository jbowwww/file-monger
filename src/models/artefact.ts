import * as nodePath from "node:path";
import { Timestamps } from ".";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));
// const logProxy = log.extend("Proxy");

export enum UpdateTimestamps {
    create ="create",
    check = "check",
    update = "update",
};

export type Artefact<T = {}> = {
    // (aspectFn: AsyncFunction<any> | Constructor<any>): Aspect;
    _id?: string;
    _ts: Timestamps;
    _v: number;
    _e?: Error | Error[];
} & T;

export const isArtefact = (value: any): value is Artefact => typeof value._ts === "object" && value._ts instanceof Timestamps && typeof value._v === "number";

const updateTimestamps = (updateType: UpdateTimestamps, _: Artefact<any>) => { 

};

export const Artefact = <T extends {}>(data?: T | Artefact<T>, enableTimestamps: boolean = true) => {
    const _: Artefact = { _ts: new Timestamps(), _v: 1, ...data } as Artefact<T>;
    log("Artefact(): data=%O enableTimestamps=%b, _=%O", data, enableTimestamps, _);
    return _;
};

Artefact.stream = async function* stream<I, T extends {}>(source: AsyncIterable<I>, transform: (...args: [I]) => T) {
    for await (const item of source) {
        yield /* transform ?  */this(transform(...[item]))/*  : this(item, true) */;
    }
};
