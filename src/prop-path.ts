export type ObjectWithProperties = { [K: string]: any };

export const get = (obj: ObjectWithProperties, path: string | number): any => (path as string).split('.').reduce((prev, curr) => prev ? prev[curr] : undefined, obj);
//     const paths = (path as string).split(".");
//     if (paths.length === 1) {
//         return obj[paths.shift()!];
//     }
//     return get(obj[paths.shift()!], paths.join("."));
// }

export const set = (obj: ObjectWithProperties, path: string | number, value: any): any => {
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