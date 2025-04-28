export type ObjectWithProperties = { [K: string]: any };

export const get = <T = any>(obj: ObjectWithProperties, path: string | number, createPaths: boolean = false, defaultValue?: T): T =>
    <T>((path as string).split('.').reduce(
        (prev, curr, index, arr) => prev ? (
            prev?.[curr] ?? (
                prev[curr] = index === arr.length - 1 ?
                    (defaultValue ?? undefined) :
                    createPaths ? {} : undefined
         )) : defaultValue, obj));
//     const paths = (path as string).split(".");
//     if (paths.length === 1) {
//         return obj[paths.shift()!];
//     }
//     return get(obj[paths.shift()!], paths.join("."));
// }

export const set = <T = any>(obj: ObjectWithProperties, path: string | number, value: any): T | undefined => {
    const paths = (path as string).split(".");
    if (paths.length === 1) {
        obj[paths.shift()!] = value;
        return value;
    } else {
        set(obj[paths.shift()!], paths.join("."), value);
    }
}

export const has = (obj: ObjectWithProperties, path: string | number): boolean => {
    const paths = (path as string).split(".");
    if (paths.length === 0) {
        return obj !== undefined;
    }
    return has(obj[paths.shift()!], paths.join("."));
}