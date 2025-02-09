import * as nodeUtil from "node:util";

export type AsyncFunction<TArgs extends any[] = [], TReturn extends any = void> = (...args: TArgs) => Promise<TReturn>;

export const getKeysOfUndefinedValues = (obj: any) => Object.entries(obj).filter(([K, V]) => V === undefined).map(([K, V]) => K);
export const buildObjectWithKeys = <R extends {}>(keys: string[], value?: any) => Object.fromEntries(keys.map(K => ([K, value]))) as R;

export function enumerable(enumerable: boolean) {
    return function (target: any, key: string/* , desc: any */ /* context: ClassFieldDecoratorContext<FileArtefact> */): any {
        // const key = context.name as string;
        console.debug(`enumerable(${enumerable}): key=${key} target=${nodeUtil.inspect(target)} / ${target} target.prototype=${nodeUtil.inspect(target.prototype)} / ${target.prototype} target[key] = ${nodeUtil.inspect(target[key])}`);
        // while (!!target && !Object.hasOwn(target, key)) {
        //     console.debug(`target = target.prototype = ${nodeUtil.inspect(target.prototype)}`);
        //     target = target.prototype;
        // }
        const desc = Object.getOwnPropertyDescriptor(target, key) ?? { value: "", configurable: true, writable: true };
        desc.enumerable = enumerable;
        console.debug(`desc = ${nodeUtil.inspect(desc)}`);
        // return desc;
        Object.defineProperty(target, key, desc);
        // if (!!target) {
        //     Object.defineProperty(target, key, { set(value) {
        //         console.debug(`target[key] 3 = ${nodeUtil.inspect(target[key])}`);
        //         Object.defineProperty(this, key, { value, configurable: true, writable: true, enumerable });
        //         console.debug(`target[key] 4 = ${nodeUtil.inspect(target[key])}`);
        //     }, configurable: true });
        //     console.debug(`target[key] 2 = ${nodeUtil.inspect(target[key])}`);
        // }
    };
};