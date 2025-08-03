import * as nodePath from "node:path";

import { isProxy } from "util/types";
import { isNonDateObject } from "./models";
import { Artefact } from "./models/artefact";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export const logProxy = log.extend("Proxy");

let _enableTimestamps = true;
const targets = new WeakMap();

export type ChangeNotifyCallback = (path: string, oldValue: any, newValue: any, isModified: boolean) => void;

export const ChangeTrackingProxy = <T extends {}>(target: T, notifyCallback: ChangeNotifyCallback, prefix = "", rootTarget?: T): T => {
    rootTarget ??= target;
    log("ArtefactProxy(): target=${%O} prefix=%s, rootTarget===target=%b targets.has(target)=%b", target, prefix, rootTarget === target, targets.has(target));
    return targets.has(target) ? targets.get(target) : targets.set(target, new Proxy(target as {}, {
        set(target: T, K: string, newValue: any, receiver: T) {
            log("ArtefactProxy().set: target=%O K=%s, rootTarget===target=%b", target, K, rootTarget === target);
            let modified = false;
            const oldValue = Reflect.get(target, K, target);
            if (oldValue !== newValue) {
                if (typeof oldValue === "object" && isNonDateObject(newValue)) {
                    let isModified = false;
                    isModified ||= Reflect.set(/* oldValue as {} */ target, K, newValue, this);
                    notifyCallback(prefix + K, oldValue, newValue, isModified);
                    return isModified;
                } else {
                    if (Reflect.set(target, K, newValue, target /* receiver */ /* this */)) {
                        notifyCallback(prefix + K, oldValue, newValue, true);
                        return true;
                    }
                    notifyCallback(prefix + K, oldValue, newValue, false);
                    return true;
                }
            } else {
                notifyCallback(prefix + K, oldValue, newValue, false);
                return true;
            }
            throw new Error("Should not reach here! ${__filename}: ArtefactProxy:195");
        },
        get(target: { [K: string]: any; }, K: string, receiver: Artefact) {
            if (K === "updateTimestamps") {
                return function updateTimestamps(updateTimestamps: boolean = true) {
                    _enableTimestamps = updateTimestamps;
                };
            } else {
                const value = Reflect.get(target, K, target);
                if (value !== null && value !== undefined) {
                    if (typeof value === "function") {
                        return value.bind(target);
                    } else if (isNonDateObject(value) && !targets.has(this) && !isProxy(value)) {
                        return ChangeTrackingProxy(value, notifyCallback, K + ".", rootTarget ?? target);
                    }
                    return value;
                }
            }
        }
    })).get(target);
};
