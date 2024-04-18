
export type ArtefactAspect<T> = (T extends new (...args: any[]) => any ? InstanceType<T> : T)
    | Promise<any>
    | ((...args: any[]) => any)
    | ((...args: any[]) => Promise<any>)
    | object;

export type ArtefactAspects<T> = {
    [K in keyof T]: (T[K] extends new (...args: any[]) => any ? InstanceType<T[K]> : T[K]) | undefined;
};

export function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj.hasOwnProperty(Symbol.asyncIterator);
}
export function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj.hasOwnProperty(Symbol.iterator);
}
export function isArtefactAspects<T extends ArtefactAspects<T>>(obj: any): obj is ArtefactAspects<T> {
    return typeof obj === 'object'; // literally each input item is really just a POJO (a class will also have prototype and ctor though)
}

// TypeScript class to define the Artefact structure
type Artefact<T extends { [K: string]: any } = any> = Partial<{ [K in keyof T]: T[K] }>;

var Artefact = (...instances: ArtefactAspect<any>) => Object.create(Artefact.prototype, {
    _schema: { configurable: false, enumerable: false, writable: false, value: {} }
}).add(instances);

Artefact.prototype = {
        
        _schema: undefined,

        constructor: Artefact,
        add<T>(...instances: ArtefactAspect<T>[]): Artefact {
            for (const instance of instances) {
                const constructorName = instance[key].constructor.name;
                this._schema[constructorName] = instance[key].constructor;
                this[constructorName] = instance[key];
            }
            return this;
        },

        // Absorbs all the input items into one Artefact.
        // Yields this same Artefact instance each time it absorbs another item,
        // but this can be ignored and just await the final result if wanted.
        async* absorb<T>(input: AsyncIterable<ArtefactAspect<T>> | Iterable<ArtefactAspect<T>> | AsyncGenerator<ArtefactAspect<T>>) {
            if (isAsyncIterable(input)) {
                for await (const instance of input) {
                    yield this.add(instance);
                }
            } else if (isIterable(input)) {
                for (const instance of input) {
                    yield this.add(instance);
                }
            }
            return this;
        },
    
        async* stream<T extends { [K: string]: any }>(iterable: AsyncIterable<ArtefactAspect<T>> | AsyncGenerator<ArtefactAspect<T>>) {
            for await (const instance of iterable) {
                yield Artefact(instance) as Artefact<Partial<T>>;
            }
        }

    }
};
