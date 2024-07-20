
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
