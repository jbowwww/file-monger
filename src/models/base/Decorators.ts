import { updatedKeys } from "./Artefact";
import { Aspect, AspectUpdateEventArgs, ClassConstructor } from "./Artefact2";

type ClassDecorator<TClass extends FunctionConstructor = FunctionConstructor> = (
    value: any,
    context: ClassDecoratorContext
    // {
    //   kind: 'class';
    //   name: string | undefined;
    //   addInitializer(initializer: () => void): void;
    // }
  ) => void;

type ClassPropertyDecorator<TClass extends FunctionConstructor = FunctionConstructor> = (
    value: any,
    // propertyKey: string | symbol,
    context: ClassFieldDecoratorContext,
    // {
    //   kind: 'property';
    //   name: string | undefined;
    //   addInitializer(initializer: () => void): void;
    // }:
  ) => void;

export type TriggerMap = {
    [K: string]: true | 1 | ((oldValue: any, newValue: any) => boolean);
  };

export const trigger = <TUpdater extends (...args: any[]) => any>(targetUpdater: TUpdater, triggerMap: TriggerMap) => {
    return ((target: Aspect<any> & { [K: string | symbol]: any }/* InstanceType<ClassConstructor<Aspect<any>>> */, { kind, name, addInitializer }: ClassFieldDecoratorContext) => {
        target.on(Aspect.updateSymbol, async function (this: InstanceType<ClassConstructor<Aspect<any>>>, updateEventArgs: AspectUpdateEventArgs) {
            const newValue = await targetUpdater(this);
            if (target[name] !== newValue) {
                target[name] = newValue;
                if (typeof target._ts !== 'object')
                    target._ts[name] = {};
                target._ts[name] = updateEventArgs._ts;
                process.nextTick(() => { target.emit(Aspect.updateSymbol, { updatedKeys: [name], _ts: new Date() })});
            }
        });
    });
};
