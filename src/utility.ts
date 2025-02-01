export const getKeysOfUndefinedValues = (obj: any) => Object.entries(obj).filter(([K, V]) => V === undefined).map(([K, V]) => K);
export const buildObjectWithKeys = <R extends {}>(keys: string[], value?: any) => Object.fromEntries(keys.map(K => ([K, value]))) as R;
