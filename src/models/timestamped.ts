import { isDate } from "util/types";
import { AbstractConstructor, Aspect, KeyValuePair, mapObject } from ".";
import { ChangeTrackingProxy } from "../change-tracking-proxy";


export type TimestampsInitializer = {
    [K: string]: true | Date | undefined;
};

export type Timestamps<T extends Record<string, boolean | Date | undefined>> = {
    [P in keyof T]: T[P] extends undefined | false ? Date | undefined : T[P] extends true ? Date : Date | undefined;
};
export const Timestamps = <T extends Record<string, boolean | Date | undefined>>(init?: T): Timestamps<T> =>
    mapObject<T, Timestamps<T>>(init ?? {} as T, ([K, V]) =>
        ([K, !K ? undefined : typeof V === "boolean" && V === true ? new Date() : isDate(V) ? V : undefined ]) as KeyValuePair<keyof T, Timestamps<T>[keyof T]>);

export const CrudTimestamps = <T extends Record<string, boolean | Date | undefined>>(timestamps?: T) => Timestamps<T>(timestamps);

export function WithTimestamp(newTypeName: string, aspectType: AbstractConstructor, date?: Date): AbstractConstructor;
export function WithTimestamp(aspectType: AbstractConstructor, date?: Date): AbstractConstructor;
export function WithTimestamp(aspectTypeOrNewName: AbstractConstructor | string, aspectTypeOrDate?: AbstractConstructor | Date, date?: Date): AbstractConstructor {
    let aspectType: AbstractConstructor<Aspect> = aspectTypeOrDate && !isDate(aspectTypeOrDate) ? aspectTypeOrDate : aspectTypeOrNewName as AbstractConstructor;
    let newTypeName = typeof aspectTypeOrNewName === "string" ? aspectTypeOrNewName : "Timestamped" + aspectType.name;
    date = isDate(aspectTypeOrDate) && !date ? aspectTypeOrDate : date;
    const newType = class extends aspectType {
        _ts = CrudTimestamps();
        constructor(...args: ConstructorParameters<typeof aspectType>) {
            super(...args);
            const notify = (path: string, oldValue: any, newValue: any, isModified: boolean) => {
                
            };
            return ChangeTrackingProxy(this, notify);
        }
    };
    Object.defineProperty(newType, "name", { value: newTypeName });
    return newType;
}
