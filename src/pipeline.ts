import * as nodePath from "node:path";
import { inspect } from "node:util";
import { get, ObjectWithProperties } from "./prop-path";
import { AnyParameters, Function, isFunction, MaybeAsyncFunction, makeDefaultOptions, getFunctionName } from "./models";
import { Task } from "./task";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type AsyncGeneratorFunction<I = any, O = any, R = any, N = any, L extends number = 0 | 1> =
    (...args:
        L extends 1 ? [AsyncIterable<I>/* , ...extra: AnyParameters */] :
        L extends 0 ? [/* ...extra: AnyParameters */] : [AsyncIterable<I>/* , ...extra: AnyParameters */]) => AsyncGenerator<O, R, N>;

export type AsyncGeneratorSourceFunction<O = any, R = any, N = any> = AsyncGeneratorFunction<never, O, R, N, 0>;

export type AsyncGeneratorTransformFunction<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;

export type PipelineSource<I = any, R = any, N = any> = Iterable<I, R, N> | AsyncIterable<I, R, N>;
export type PipelineSourceFunction<I = any, R = any, N = any> = Function<AnyParameters, PipelineSource<I, R, N>>;
export type PipelineInput<I = any, R = any, N = any> = PipelineSource<I, R, N> | PipelineSourceFunction<I, R, N>;
export type PipelineItemFunctionStage<I = any, O = any> = MaybeAsyncFunction<[I/* , ...AnyParameters */], O>;
export type PipelineFunctionStage<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 0>;//(source: AsyncIterable<I>, ) => AsyncIterable<O, R, N>;
export type PipelineGeneratorStage<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;
export type PipelineStage<I = any, O = any, R = void> = PipelineGeneratorStage<I, O, R> | PipelineItemFunctionStage<I, O>;
export type PipelineSink<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;//(source: AsyncIterable<I, any, any>) => AsyncIterable<O, R, any>;
export type PipelineFunction<I = any, O = any, R = any, N = any> = (source: PipelineInput<I, R, never>) => AsyncGenerator<O, R, N>;
export type Pipeline<I = any, O = any, R = any, N = any> = AsyncGenerator<O, R, N> & {
    execute: (sinkFn?: (source: AsyncIterable<O, R, never>) => R | Promise<R>) => R | Promise<R>;
};

export const isIterable = <T extends any = any, R = any, N = any>(value: any): value is Iterable<T, R, N> => value && Symbol.iterator in value && typeof value[Symbol.iterator] === "function";
export const isAsyncIterable = <T extends any = any, R = any, N = any>(value: any): value is AsyncIterable<T, R, N> => value && Symbol.asyncIterator in value && typeof value[Symbol.asyncIterator] === "function";
export const isAsyncGenerator = <T = unknown, R = any, N = any>(value: any): value is AsyncGenerator<T, R, N> => value && isAsyncIterable(value) && "next" in value && typeof value.next === "function";
export const isAsyncGeneratorFunction = <I = any, O = any, R = any, N = any, L extends 0 | 1 = 0 | 1>(value: any, argumentsLength?: L): value is AsyncGeneratorFunction<I, O, R, N, L> =>
        value && typeof value === "function" && isAsyncGenerator<O, R, N>(value.prototype) && (!argumentsLength || value.length === argumentsLength);
export const isAsyncGeneratorSourceFunction = <O = any, R = any, N = any>(value: any): value is AsyncGeneratorFunction<never, O, R, N, 0> => isAsyncGeneratorFunction<never, O, R, N, 0>(value, 0)
export const isAsyncGeneratorTransformFunction = <I = any, O = unknown, R = any, N = any>(value: any): value is AsyncGeneratorFunction<I, O, R, N, 1> => isAsyncGeneratorFunction<I, O, R, N, 1>(value, 1);

export const makeAsyncGeneratorFunction = <I = any, O = any>(stage: PipelineItemFunctionStage<I, O>) =>
    async function* (innerSource: AsyncIterable<I, any, any>) {
        for await (const item of innerSource) {
            yield await stage(item as I);
        }
    };

export const makeAsyncGenerator = <I = any, R = any, N = any>(source: PipelineInput<I, R, undefined>) => {
    source = isFunction(source) ? source() : source;
    return isAsyncIterable(source) ?
        (async function* (asyncIterable: AsyncIterable<I, R, undefined>) {
            for await (const item of asyncIterable) {
                yield item;
            }
        })(source) :
        (async function* (syncIterable: Iterable<I, R, undefined>) {
            for (const item of syncIterable) {
                yield item;
            }
        })(source);
};

export function chain<T0 = any, T1 = any>(stage0: PipelineItemFunctionStage<T0, T1>): PipelineItemFunctionStage<T0, T1>;
export function chain<T0 = any, T1 = any, T2 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>): PipelineItemFunctionStage<T0, T2>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>, stage2: PipelineItemFunctionStage<T2, T3>): PipelineItemFunctionStage<T0, T3>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>, stage2: PipelineItemFunctionStage<T2, T3>, stage3: PipelineItemFunctionStage<T3, T4>): PipelineItemFunctionStage<T0, T4>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any>(stage0: PipelineItemFunctionStage<T0, T1>, stage1: PipelineItemFunctionStage<T1, T2>, stage2: PipelineItemFunctionStage<T2, T3>, stage3: PipelineItemFunctionStage<T3, T4>, stage4: PipelineItemFunctionStage<T4, T5>): PipelineItemFunctionStage<T0, T5>;
export function chain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any>(
    stage0: PipelineItemFunctionStage<T0, T1>,
    stage1?: PipelineItemFunctionStage<T1, T2>,
    stage2?: PipelineItemFunctionStage<T2, T3>,
    stage3?: PipelineItemFunctionStage<T3, T4>,
    stage4?: PipelineItemFunctionStage<T4, T5>
): PipelineItemFunctionStage<T0, T1 | T2 | T3 | T4 | T5> {
    return (source: T0, ...args: AnyParameters) => [stage0, stage1, stage2, stage3, stage4].reduce<any>(async (r, s, i, a) => s ? s(...[await r]) : /* await */ r, source);
}

export function genChain<T0 = any, T1 = any, R = void>(stage0: PipelineStage<T0, T1, R>): PipelineFunction<T0, T1, R>;
export function genChain<T0 = any, T1 = any, T2 = any, R = void>(stage0: PipelineStage<T0, T1, R | void>, stage1: PipelineStage<T1, T2, R>): PipelineFunction<T0, T2, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, R = void>(stage0: PipelineStage<T0, T1, R | void>, stage1: PipelineStage<T1, T2, R | void>, stage2: PipelineStage<T2, T3, R>): PipelineFunction<T0, T3, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = void>(stage0: PipelineStage<T0, T1, R | void>, stage1: PipelineStage<T1, T2, R | void>, stage2: PipelineStage<T2, T3, R | void>, stage3: PipelineStage<T3, T4, R>): PipelineFunction<T0, T4, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(stage0: PipelineStage<T0, T1, R | void>, stage1?: PipelineStage<T1, T2, R | void>, stage2?: PipelineStage<T2, T3, R | void>, stage3?: PipelineStage<T3, T4, R | void>, stage4?: PipelineStage<T4, T5, R>): PipelineFunction<T0, T5, R>;
export function genChain<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
    stage0: PipelineStage<T0, T1, R | void>,
    stage1?: PipelineStage<T1, T2, R | void>,
    stage2?: PipelineStage<T2, T3, R | void>,
    stage3?: PipelineStage<T3, T4, R | void>,
    stage4?: PipelineStage<T4, T5, R | void>,
): PipelineFunction<T0, T1 | T2 | T3 | T4 | T5, R> {
    // TODO: Someway to reduce the stages to an asyncgeneratorfunction and then return a fn(source) that calls that fn with source, returning asynciterable
    const r = async function* (source: PipelineInput<T0>) {
        let isLastStage = false;
        const r = [stage0, stage1, stage2, stage3, stage4]
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

            }, makeAsyncGenerator(source)) as AsyncGenerator<T1 | T2 | T3 | T4 | T5, R>;
        yield* r;
    };
    return r as PipelineFunction<T0, T1 | T2 | T3 | T4 | T5, R>;
}
export const pipeline = genChain;

export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1, R>): Pipeline<T0, T1, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): Pipeline<T0, T2, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): Pipeline<T0, T3, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): Pipeline<T0, T4, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineSource<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4>, stage4: PipelineStage<T4, T5, R>): Pipeline<T0, T5, R>;
export function pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
    source: PipelineInput<T0>,
    stage0: PipelineStage<T0, T1, R | void>,
    stage1?: PipelineStage<T1, T2, R | void>,
    stage2?: PipelineStage<T2, T3, R | void >,
    stage3?: PipelineStage<T3, T4, R | void>,
    stage4?: PipelineStage<T4, T5, R>
): Pipeline<T0, T1 | T2 | T3 | T4 | T5, R> {
    const iterable = Object.assign(
        pipeline<T0, T1, T2, T3, T4, T5, R>(stage0, stage1, stage2, stage3, stage4)(source), {
            execute(sinkFn?: (source: AsyncIterable<T5, R, never>) => R | Promise<R>) {
                return (
                    sinkFn?.(iterable) ??
                    execute<T0, T5, R>(iterable) );
            },
        });
    log(`iterable=${inspect(iterable)} iterable.toString()=${iterable.toString()}`);
    return iterable;
}

export async function execute<I = any, O = any, R = void, N = any>(pipeline: Pipeline<I, O, R, N>, itemFunc?: (item: O) => N | Promise<N>): Promise<R> {
    let n: N | undefined = void undefined;
    do {
        const { value, done } = await pipeline.next(...n ? [n] : []);
        if (done) {
            return Promise.resolve(value);
        } else if (value) {
            n = await itemFunc?.(value);
        }
    } while (true);
}

export const tap = <I = any>(fn: (input: I) => Promise<void>) =>
    async function* (source: AsyncIterable<I>) {
        for await (const item of source) {
            await fn(item);
            yield item;
        }
    };
export const iff = <I = any, O = any>(condition: MaybeAsyncFunction<[I], boolean>, stage: PipelineItemFunctionStage<I, O>) => makeAsyncGeneratorFunction(
    async (input: I, ...args: AnyParameters) => (await condition(input) ? stage(input/* , ...args */) : input));
export const exists = <I = any>(propertyPath: string) => (input: I) => !!get(input as ObjectWithProperties, propertyPath);


// export function onFinishIteration(input: AsyncIterator<any>, onFinish: () => void): AsyncIterator<any>;
// export function onFinishIteration(input: AsyncIterable<any>, onFinish: () => void): AsyncIterable<any>;
// export function onFinishIteration<T extends AsyncIterator<any> | AsyncIterable<any>>(input: T, onFinish: () => void): T {
export function onFinishIteration<T>(input: AsyncIterable<T>, onFinish: () => void): AsyncIterable<T> {
    log(`onFinishIteration(): input=${input} onFinish=${getFunctionName(onFinish)}`);
    return ({
        [Symbol.asyncIterator]() {
            const it = input[Symbol.asyncIterator]();
            return ({
                ...it,
                async next(...args: [] | [any]) {
                    const value = await it.next(...args);
                    if (value.done) {
                        log(`onFinishIteration(): input=${input} onFinish=${getFunctionName(onFinish)}`);
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
    let done = false;
    const numSources = sources.length;
    let numSettled = 0, itemCount = 0;
    const its = sources.concat(...secondarySources).map(s => s[Symbol.asyncIterator]());
    let prs = its.filter(it => it).map((it, i) => it.next().then(item => onResolve(item, i)));
    function onResolve(item: IteratorResult<I, any>, i: number) {
        let newPr: Promise<IteratorResult<I, any>>;
        if (item.done) {
            if (++numSettled === numSources) {
                done = true;
            }
            newPr = new Promise((resolve, reject) => {});  // that input has finished, set it's next promise to one that never resolves
        } else {
            newPr = its[i].next().then(item => onResolve(item, i));
        }
        prs = [...prs.slice(0, i), newPr, ...prs.slice(i+1, numSources)];
        return item;
    }
    while (!done) {
        const item = await Promise.race(prs);
        if (item.done) {
            return item.value;
        }
        yield item.value;
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
