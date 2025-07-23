import * as nodePath from "node:path";
import { inspect } from "node:util";
import { get, ObjectWithProperties } from "./prop-path";
import { makeDefaultOptions, AnyParameters, Function, isFunction, getFunctionName, MaybeAsyncFunction, isAsyncIterable, AsyncGeneratorFunction, isAsyncGeneratorFunction, isNumber } from "./models";
import { Task } from "./task";
import { Progress } from "./progress";

import debug from "debug";
import { isAsyncFunction } from "node:util/types";
const log = debug(nodePath.basename(module.filename));

// export type PipelineSourceSourceFunction<O = any, R = any, N = any> = PipelineSourceFunction<never, O, R, N, 0>;

// export type PipelineSourceTransformFunction<I = any, O = any, R = any, N = any> = PipelineSourceFunction<I, O, R, N, 1>;

export type PipelineSourceLengthWrappedProperty = number | Function<[], number>;
export type PipelineSourceLengthWrapped<T, R = void, N = any, L extends PipelineSourceLengthWrappedProperty = PipelineSourceLengthWrappedProperty> = PipelineSource<T, R, N> & { length?: L; };
export type PipelineSourceLengthWrappingFn<T, R = void, N = any, L extends PipelineSourceLengthWrappedProperty = PipelineSourceLengthWrappedProperty> = ({ length }: { length?: L }) => PipelineSource<T, R, N>;
export const wrapPipelineSourceWithLength = <T, R = void, N = any, L extends PipelineSourceLengthWrappedProperty = PipelineSourceLengthWrappedProperty>(
    wrappingFn: PipelineSourceLengthWrappingFn<T, R, N, L>
): PipelineSourceLengthWrapped<T, R, N> => {
    let length: L | undefined = undefined;
    const wrappedGen = wrappingFn({ length });
    return Object.assign(wrappedGen, !length ? {} : isNumber(length) ? { length } : { get length() { return (length as Function<[], number>)(); } });
};

export type PipelineSource<I = any, R = any, N = any> = Iterable<I, R, N> | AsyncIterable<I, R, N>;
export type PipelineSourceFunction<I = any, R = any, N = any, P extends AnyParameters = AnyParameters> = Function<P, PipelineSource<I, R, N>>;
export type PipelineInput<I = any, R = any, N = any, P extends [any] | any[] = [any] | any[]> = PipelineSource<I, R, N> | PipelineSourceFunction<I, R, N> | [PipelineSourceFunction<I, R, N, P>, ...args: P];
export type PipelineItemFunctionStage<I = any, O = any> = MaybeAsyncFunction<[I/* , ...AnyParameters */], O>;
export type PipelineFunctionStage<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 0>;//(source: AsyncIterable<I>, ) => AsyncIterable<O, R, N>;
export type PipelineGeneratorStage<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;
export type PipelineStage<I = any, O = any, R = any> = PipelineGeneratorStage<I, O, R> | PipelineItemFunctionStage<I, O>;
export type PipelineSink<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;//(source: AsyncIterable<I, any, any>) => AsyncIterable<O, R, any>;
export type PipelineFunction<I = any, O = any, R = any, N = any> = (source: PipelineInput<I, R, never>) => AsyncGenerator<O, R, N>;
export type Pipeline<I = any, O = any, R = any, N = any> = AsyncGenerator<O, R, N> & {
    execute: (sinkFn?: (source: AsyncIterable<O, R, never>) => R | Promise<R>) => R | Promise<R>;
};

export const inspectStage = (stage: PipelineStage<any, any> | undefined): string => !stage ? "(undefined)" : ((isAsyncFunction(stage) ? "[AsyncFunction: " : isFunction(stage) ? "[Function: " : "") + (stage.name ?? stage?.toString()));
export const inspectStages = (stages: (PipelineStage<any, any> | undefined)[]): string => stages.map(inspectStage).join(",\n\t");

export const isAsyncGeneratorSourceFunction = <O = any, R = any, N = any>(value: any): value is AsyncGeneratorFunction<never, O, R, N, 0> => isAsyncGeneratorFunction<never, O, R, N, 0>(value, 0)
export const isAsyncGeneratorTransformFunction = <I = any, O = unknown, R = any, N = any>(value: any): value is AsyncGeneratorFunction<I, O, R, N, 1> => isAsyncGeneratorFunction<I, O, R, N, 1>(value, 1);

export const makeAsyncGeneratorFunction = <I = any, O = any>(stage: PipelineItemFunctionStage<I, O>) =>
    async function* (innerSource: AsyncIterable<I, any, any>) {
        for await (const item of innerSource) {
            yield await stage(item as I);
        }
    };

export const makeAsyncGenerator = <I = any, R = any, N = any>(source: PipelineInput<I, R, undefined>): AsyncGenerator<I, any, N> => {
    const innerSource: PipelineSource<I, R, undefined> = Array.isArray(source) && source.length === 2 &&
        isFunction(source[0]) && Array.isArray(source[1]) &&
        source[0].length === source[1].length ? source[0](...source[1]) :
        isFunction(source) && source.length > 0 ?  source() : source as PipelineSource<I, R, undefined>;
    return isAsyncIterable(innerSource) ?
        (async function* (asyncIterable: AsyncIterable<I, R, undefined>) {
            for await (const item of asyncIterable) {
                yield item;
            }
        })(innerSource) :
        (async function* (syncIterable: Iterable<I, R, undefined>) {
            for (const item of syncIterable) {
                yield item;
            }
        })(innerSource);
};

export function chain<T0 = any, T1 = any>(stage0: PipelineItemFunctionStage<T0, T1>): PipelineItemFunctionStage<T0, T1>;
export function chain<T0 = any, T1 = any, T2 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>): PipelineItemFunctionStage<T0, T2>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>, stage2: PipelineItemFunctionStage<T2, T3>): PipelineItemFunctionStage<T0, T3>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>, stage2: PipelineItemFunctionStage<T2, T3>, stage3: PipelineItemFunctionStage<T3, T4>): PipelineItemFunctionStage<T0, T4>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>, stage2: PipelineItemFunctionStage<T2, T3>, stage3: PipelineItemFunctionStage<T3, T4>, stage4: PipelineItemFunctionStage<T4, T5>): PipelineItemFunctionStage<T0, T5>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1?: PipelineItemFunctionStage<T1, T2>, stage2?: PipelineItemFunctionStage<T2, T3>, stage3?: PipelineItemFunctionStage<T3, T4>, stage4?: PipelineItemFunctionStage<T4, T5>, stage5?: PipelineItemFunctionStage<T5, T6>): PipelineFunction<T0, T6>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1?: PipelineItemFunctionStage<T1, T2>, stage2?: PipelineItemFunctionStage<T2, T3>, stage3?: PipelineItemFunctionStage<T3, T4>, stage4?: PipelineItemFunctionStage<T4, T5>, stage5?: PipelineItemFunctionStage<T5, T6>, stage6?: PipelineItemFunctionStage<T6, T7>): PipelineFunction<T0, T7>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1?: PipelineItemFunctionStage<T1, T2>, stage2?: PipelineItemFunctionStage<T2, T3>, stage3?: PipelineItemFunctionStage<T3, T4>, stage4?: PipelineItemFunctionStage<T4, T5>, stage5?: PipelineItemFunctionStage<T5, T6>, stage6?: PipelineItemFunctionStage<T6, T7>, stage7?: PipelineItemFunctionStage<T7, T8>): PipelineFunction<T0, T8>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any>(
    stage0: PipelineItemFunctionStage<T0, T1>,
    stage1?: PipelineItemFunctionStage<T1, T2>,
    stage2?: PipelineItemFunctionStage<T2, T3>,
    stage3?: PipelineItemFunctionStage<T3, T4>,
    stage4?: PipelineItemFunctionStage<T4, T5>,
    stage5?: PipelineItemFunctionStage<T5, T6>,
    stage6?: PipelineItemFunctionStage<T6, T7>,
    stage7?: PipelineItemFunctionStage<T7, T8>
): PipelineItemFunctionStage<T0, T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8> {
    return (source: T0, ...args: AnyParameters) => [stage0, stage1, stage2, stage3, stage4, stage5, stage6, stage7].reduce<any>(async (r, s, i, a) => s ? s(...[await r]) : /* await */ r, source);
}

export function genChain<T0 = any, T1 = any, R = any>(stage0: PipelineStage<T0, T1, R>): PipelineFunction<T0, T1, R>;
export function genChain<T0 = any, T1 = any, T2 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): PipelineFunction<T0, T2, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): PipelineFunction<T0, T3, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): PipelineFunction<T0, T4, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4, R>, stage4?: PipelineStage<T4, T5, R>): PipelineFunction<T0, T5, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5, R>, stage5?: PipelineStage<T5, T6, R>): PipelineFunction<T0, T6, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5>, stage5?: PipelineStage<T5, T6, R>, stage6?: PipelineStage<T6, T7, R>): PipelineFunction<T0, T7, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any, R = any>(stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5>, stage5?: PipelineStage<T5, T6>, stage6?: PipelineStage<T6, T7, R>, stage7?: PipelineStage<T7, T8, R>): PipelineFunction<T0, T8, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any, R = any>(
    stage0: PipelineStage<T0, T1, R>,
    stage1?: PipelineStage<T1, T2, R>,
    stage2?: PipelineStage<T2, T3, R>,
    stage3?: PipelineStage<T3, T4, R>,
    stage4?: PipelineStage<T4, T5, R>,
    stage5?: PipelineStage<T5, T6, R>,
    stage6?: PipelineStage<T6, T7, R>,
    stage7?: PipelineStage<T7, T8, R>
): PipelineFunction<T0, T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8, R> {
    // TODO: Someway to reduce the stages to an asyncgeneratorfunction and then return a fn(source) that calls that fn with source, returning asynciterable
    const r = async function* (source: PipelineSource<T0, any, any>) {
        let isLastStage = false;
        const r = [stage0, stage1, stage2, stage3, stage4, stage5, stage6, stage7]
            .map((stage, i, a) => {
                if (stage) {
                    if (isLastStage) {
                        throw new TypeError(`genChain(): A stage was defined after an undefined or a PipelineSink stage at index ${i} (stages = ${inspect(a)})`);
                    } else if (isAsyncGeneratorFunction(stage)) {
                        return stage;
                    } else if (isFunction(stage)) {
                        return makeAsyncGeneratorFunction<any, any>(stage);
                    }
                } else {
                    isLastStage = true;
                }
            }).reduce((r, s, i, a) => {
                return s ? s(r) : r;

            }, makeAsyncGenerator(source)) as AsyncGenerator<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8, R>;
        yield* r;
    };
    return r as PipelineFunction<T0, T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8, R>;
}
export const pipeline = genChain;
    
export function pipe<T0 = any, T1 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1, R>): Pipeline<T0, T1, R>;
export function pipe<T0 = any, T1 = any, T2 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): Pipeline<T0, T2, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): Pipeline<T0, T3, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): Pipeline<T0, T4, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1, R >, stage1?: PipelineStage<T1, T2, R>, stage2?: PipelineStage<T2, T3, R>, stage3?: PipelineStage<T3, T4, R>, stage4?: PipelineStage<T4, T5, R>): Pipeline<T0, T5, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1, R>, stage1?: PipelineStage<T1, T2, R>, stage2?: PipelineStage<T2, T3, R>, stage3?: PipelineStage<T3, T4, R>, stage4?: PipelineStage<T4, T5, R>, stage5?: PipelineStage<T5, T6, R>): Pipeline<T0, T6, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1, R>, stage1?: PipelineStage<T1, T2, R>, stage2?: PipelineStage<T2, T3, R>, stage3?: PipelineStage<T3, T4, R>, stage4?: PipelineStage<T4, T5, R>, stage5?: PipelineStage<T5, T6, R>, stage6?: PipelineStage<T6, T7, R>): Pipeline<T0, T7, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any, R = any>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1, R>, stage1?: PipelineStage<T1, T2, R>, stage2?: PipelineStage<T2, T3, R>, stage3?: PipelineStage<T3, T4, R>, stage4?: PipelineStage<T4, T5, R>, stage5?: PipelineStage<T5, T6, R>, stage6?: PipelineStage<T6, T7, R>, stage7?: PipelineStage<T7, T8, R>): Pipeline<T0, T8, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any, R = any>(
    source: PipelineSource<T0, any, any>, 
    stage0: PipelineStage<T0, T1, R>,
    stage1?: PipelineStage<T1, T2, R>,
    stage2?: PipelineStage<T2, T3, R>,
    stage3?: PipelineStage<T3, T4, R>,
    stage4?: PipelineStage<T4, T5, R>,
    stage5?: PipelineStage<T5, T6, R>,
    stage6?: PipelineStage<T6, T7, R>,
    stage7?: PipelineStage<T7, T8, R>
): Pipeline<T0, T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8, R> {
    const iterable = Object.assign(
        pipeline<T0, T1, T2, T3, T4, T5, T6, T7, T8, R>(stage0, stage1, stage2, stage3, stage4, stage5, stage6, stage7)(makeAsyncGenerator<T0, any, any>(source)), {
            execute(sinkFn?: (source: AsyncIterable<T8, R, never>) => R | Promise<R>) {
                return (
                    sinkFn?.(iterable) ??
                    execute<T0, T8, R>(iterable) );
            },
        });
    log(`iterable=${inspect(iterable)} iterable.toString()=${iterable.toString()}`);
    return iterable;
}

export async function execute<I = any, O = any, R = any, N = any>(pipeline: Pipeline<I, O, R, N>, itemFunc?: (item: O) => N | Promise<N>): Promise<R> {
    let n: N | undefined = undefined;
    do {
        const { value, done } = await pipeline.next(...n ? [n] : []);
        if (done) {
            return Promise.resolve(value);
        } else if (value) {
            n = await itemFunc?.(value);
        }
    } while (true);
}

export function tap<I = any>(fn: (input: I) => void | Promise<void>) {
    return async (input: I) => {
        await fn(input);
        return input;
    };
}

// export function tap<I = any>(this: any, fn: (input: I) => void | Promise<void>) {
//     const _this = this;
//     return async function* (source: AsyncIterable<I>) {
//         for await (const item of source) {
//             await fn.apply(_this, [item]);
//             yield item;
//         }
//     };
// };

export const iff = <I = any, O = any>(condition: MaybeAsyncFunction<[I], boolean>, stage: PipelineItemFunctionStage<I, O>) => makeAsyncGeneratorFunction(
    async (input: I, ...args: AnyParameters) => (await condition(input) ? stage(input/* , ...args */) : input));
export const exists = <I = any>(propertyPath: string) => (input: I) => !!get(input as ObjectWithProperties, propertyPath);


// export function onFinishIteration(input: AsyncIterator<any>, onFinish: () => void): AsyncIterator<any>;
// export function onFinishIteration(input: AsyncIterable<any>, onFinish: () => void): AsyncIterable<any>;
// export function onFinishIteration<T extends AsyncIterator<any> | AsyncIterable<any>>(input: T, onFinish: () => void): T {
export function onFinishIteration<T>(input: AsyncIterable<T>, onFinish: () => void): AsyncIterable<T> {
    log(`onFinishIteration(): wrapping input=${input} onFinish=${/* getFunctionName */(onFinish)}`);
    return ({
        [Symbol.asyncIterator]() {
            const it = input[Symbol.asyncIterator]();
            return ({
                ...it,
                async next(...args: [] | [any]) {
                    const value = await it.next(...args);
                    if (value.done) {
                        log(`onFinishIteration(): onFinishing input=${input} onFinish=${getFunctionName(onFinish)}`);
                        process.nextTick(onFinish);
                    }
                    return value;   // should i be returning this if value.done ??
                },
            });
        },
    });
}

export const interval = async function* interval(timeoutMs: number, cancel?: AbortSignal) {
    while (true) {
        await Task.delay(timeoutMs);
        if (cancel?.aborted) {
            break;
        }
        yield interval.YieldResult;
    }
};
interval.YieldResult = {};
type IntervalYieldResult = typeof interval.YieldResult;
export const isIntervalYieldResult = (value: any): value is IntervalYieldResult => value === interval.YieldResult;

export type MergeOptions = {
    closeAllOnError: boolean;
};
const MergeOptions = makeDefaultOptions<MergeOptions>({
    closeAllOnError: true,
});

export async function* merge<I = any>(sources: AsyncIterable<I>[], secondarySources: AsyncIterable<I>[] = []): AsyncGenerator<I, any, undefined> {
    let numPrimarySettled = 0;
    let numSecondarySettled = 0;
    const numPrimarySources = sources.length;
    const numSecondarySources = secondarySources.length;
    const its = sources.concat(secondarySources).map(s => s[Symbol.asyncIterator]());
    const makeOnResolve = (i: number) => (item: { value: I; done?: boolean }) => {
        // prs[i] = item.done ? undefined : its[i].next().then(makeOnResolve(i));
        return ({ ...item, i });
    };
    let prs: (Promise<{ i: number; value?: I; done?: boolean; }> | undefined)[] = its
        .map((it, i) => it.next().then(_ => ({ ..._, i/* makeOnResolve(i) */ })));
    let awaitPrs: (NonNullable<typeof prs[0]>)[] = prs as (NonNullable<typeof prs[0]>)[];
    let msg: string;
    
    while (awaitPrs.length > numSecondarySources && numPrimarySettled < numPrimarySources) {
        log(`merge(): awaitPrs=${inspect(awaitPrs)} numPrimarySettled=${numPrimarySettled} numSecondarySources=${numSecondarySources} prs=${inspect(prs)}`);
        const { value, done, i } = await Promise.race(awaitPrs);
        log(`merge(): value=${inspect(value)} done=${done} i=${i} numPrimarySettled=${numPrimarySettled} numSecondarySources=${numSecondarySources} prs=${inspect(prs)}`);
        
        if (done) {
            msg = `Source #${i} is done, setting prs[${i}] = undefined`;
            prs[i] = undefined;
            
            // Track which type of source finished
            if (i < numPrimarySources) {
                numPrimarySettled++;
                msg += `\nPrimary source finished. numPrimarySettled=${numPrimarySettled}/${numPrimarySources}`;
            } else {
                numSecondarySettled++;
                msg += `\nSecondary source finished. numSecondarySettled=${numSecondarySettled}/${numSecondarySources}`;
            }
            
            // Stop when all primary sources are done (regardless of secondary sources)
            if (numPrimarySettled >= numPrimarySources) {
                msg += `\nAll primary sources finished, stopping merge`;
                break;
            }
        } else {
            msg = `Source #${i} yielded value=${value}, setting prs[${i}] to next promise`;
            prs[i] = its[i].next().then(_ => ({ ..._, i }));
            yield value!;
        }
        
        awaitPrs = prs.filter(p => !!p);
        log(`${msg}\nprs=${inspect(prs)} awaitPrs=${inspect(awaitPrs)}`);   
    }
}

export type BatchOptions = {
    maxSize: number;
    timeoutMs: number;
};
export const BatchOptions = makeDefaultOptions<BatchOptions>({
    maxSize: 10,
    timeoutMs: 200,
});

export async function* batch<I = any>(optionsOrSource: BatchOptions | AsyncIterable<I>, sourceOrOptions?: AsyncIterable<I> | BatchOptions) {
    let batch: I[] = [];
    let options: BatchOptions;
    let source: AsyncIterable<I>;
    if (isAsyncIterable(optionsOrSource)) {
        source = optionsOrSource;
        options = BatchOptions.mergeDefaults(sourceOrOptions as BatchOptions);
    } else {
        source = sourceOrOptions as AsyncIterable<I>;
        options = BatchOptions.mergeDefaults(optionsOrSource);
    }
    const cancelInterval = new AbortController();
    for await (const item of merge<I | IntervalYieldResult>(
        [onFinishIteration(source, () => cancelInterval.abort())],
        [interval(options.timeoutMs, cancelInterval.signal)]
    )) {
        if (isIntervalYieldResult(item)) {
            if (batch.length > 0) {
                log(`batch(): Yielding by timeout (batch=${inspect(batch)}) ...`);
                yield batch;
                batch = [];
            }
        } else {
            batch.push(item);
            if (batch.length === options.maxSize) {
                log(`batch(): Yielding by size (batch=${inspect(batch)}) ...`);
                yield batch;
                batch = [];
            }
        }
    }
    
    // Emit final batch if there are remaining items
    if (batch.length > 0) {
        log(`batch(): Yielding final batch (batch=${inspect(batch)}) ...`);
        yield batch;
    }
}

export type GeneratorStats<T> = {
    inCount: number;    // items from source
    outCount: number;   // items yielded
};

export type GeneratorObjectStats<T> = {
    expectedTotalCount: number;
};

export type GeneratorReturnStats<T> = {

};

export const wrapGeneratorStats = <T extends { [K: string]: GeneratorStats<T>; }, ItemStatsKey = "_stats">(generator: AsyncGenerator<T & GeneratorStats<T> & GeneratorObjectStats<T>>, options: { itemStatsPropName: string; } = { itemStatsPropName: "_stats", }): GeneratorReturnStats<T> =>
    async function* generatorStatsWrapper(source: AsyncGenerator<T>) {
        const stats: GeneratorStats<T> = {
            inCount: 0,
            outCount: 0,
        };

        for await (const item of source) {
            stats.inCount++;
            if (!!item[options.itemStatsPropName]) {

            }
        }
    };
