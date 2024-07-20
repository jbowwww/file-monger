export class Artefact {

    constructor(...aspects: object[]) {
        return Object.assign(this, Object.fromEntries(
            aspects.map(aspect => ([ aspect.constructor.name, aspect ]))));
    }

    add(...aspects: object[]): Artefact {
        return Object.assign(this, ...aspects.map(aspect => ({
            [aspect.constructor.name]: Object.assign(aspect, { _A: this }),
        })));
    }

    static async* stream<TSchema>(
        iterable: AsyncIterable<InstanceType<ClassConstructor<Aspect<any>>> | Error> | AsyncGenerator<InstanceType<ClassConstructor<Aspect<any>>> | Error>
    ) {
        for await (const instance of iterable) {
            if (instance instanceof Error)
                // throw instance;
            console.error(`Error!: ${JSON.stringify(instance)}`);
            else
                yield new Artefact().add(instance) as Artefact & TSchema;
        }
    }

}

export type Test<T = any> = (obj: T) => boolean;

export const PropertyTriggerTableSymbol = Symbol('PropertyTriggerTableSymbol');

// Generic parameter T on methods in this object is the type of the Aspect type definition e.g. File | Directory, etc
export const Aspect = {
    
    // Create a new Aspect type (class).
    // Adds [PropertyTriggerTableSymbol] property which @Aspect.Trigger will populate with property triggers
    Type: <T extends new (...args: any[]) => any>(aspectCtor: T) => {
        return class extends aspectCtor {
            
            [PropertyTriggerTableSymbol]: {
                [K: string /* keyof T */]: Array<Test<T>>
            } = {};

            constructor(...args: any[]) {
                super(...args);
                const _aspect = this;
                const proxy = new Proxy(this, {    //new aspectCtor(...args), {
                    set(target: any, p: string, newValue: any, receiver: any): boolean {
                        const modifiedKeys = (function _set(target: any, p: string, newValue: any, receiver: any): string[] {
                            if (newValue !== target[p]) {
                                if (typeof newValue === 'object' && typeof target[p] === 'object') {
                                    const modifiedKeys: string[] = Object.keys(newValue).map(_p => _set(target[p], _p, newValue[_p], receiver)).map(_p => p + "." + _p);
                                    return modifiedKeys.length > 0 ? [p, ...modifiedKeys] : [];
                                } else {
                                    target[p] = newValue;
                                    return [p];
                                }
                            } else {
                                return [];
                            }
                        })(target, p, newValue, receiver);
                        const didSet = modifiedKeys.length > 0;
                        console.log(`Aspect:${aspectCtor.name}.${p.toString()}.set(${JSON.stringify(newValue)}): ${didSet}`);
                        for (const triggeredProperty in Object.getOwnPropertyNames(_aspect[PropertyTriggerTableSymbol])) {
                            if (modifiedKeys.includes(triggeredProperty)) {
                                console.log(`\t${triggeredProperty} modified: Trigger `)        
                            }
                        }
                        return didSet;
                    },
                });
                return proxy;
            }
            
        };
    },

    // decorator for specifying properties that trigger updates on the property the decorator is being applied to
    Trigger: <T extends new (...args: any[]) => any> (
        triggerPropertyName: string,
        triggerConditionTest: Test<T> = (aspect: T) => true
    ) => {
        return function (target: InstanceType<T>, propertyName: string) {
            // if (!(target instanceof Function)) {
            //     throw new TypeError(`target is not a Function instance in decorator Aspect.Trigger`);
            // }
            if (!Object.hasOwn(target, PropertyTriggerTableSymbol)) {
                Object.defineProperty(target, PropertyTriggerTableSymbol, { configurable: true, value: (target[PropertyTriggerTableSymbol] ?? []).push() });
            }
            target[PropertyTriggerTableSymbol][propertyName].push(triggerConditionTest);
        };
    },

};