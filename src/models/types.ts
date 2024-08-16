
export function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj.hasOwnProperty(Symbol.asyncIterator);
}

export function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj.hasOwnProperty(Symbol.iterator);
}

// export type ClassConstructor<TClass = any, TCtorArgs extends any[] = any[]> = new (...args: TCtorArgs) => TClass;
export type ClassConstructor = new (...args: any[]) => any;

export type DataMembers<TClass> = Exclude<TClass, Function>;

export class createAsync {
    static createAsync: <T extends new (...args: any[]) => any>(data: DataMembers<T>) => Promise<InstanceType<T>>;
};

// export type ObjectMapFunction<T extends {}, O extends {}> = (([K, V]: [keyof T, T[keyof T]]) => ([keyof O, O[keyof O]]));

export type ObjectMapFunction = (([K, V]: [string, unknown]) => ([string, unknown]));
export type ObjectMapToPropertiesFunction = (([K, V]: [string, unknown]) => ([string, PropertyDescriptor]));

// export function objectMap<T extends { [K: string]: unknown; }, O extends { [K: string]: unknown; }>(source: T, mapFn: ObjectMapFunction<T, O>) {
export function objectMap(source: any, mapFn: ObjectMapFunction) {
    return Object.fromEntries(Object.entries(source).map(mapFn));
}

export function objectMapToProperties(source: any, mapFn: ObjectMapToPropertiesFunction) {
    return Object.defineProperties({}, Object.fromEntries(Object.entries(source).map(mapFn)));
}