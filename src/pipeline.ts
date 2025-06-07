import * as nodePath from "node:path";
import { get, ObjectWithProperties } from "./prop-path";
import { Readable } from "node:stream";
import { inspect } from "node:util";

import debug from "debug";
import { AnyParameters, Function, AsyncFunction, isFunction, MaybeAsyncFunction, makeDefaultOptions } from "./models";
import { Task } from "./task";
import { Batch, BulkWriteResult } from "mongodb";
const log = debug(nodePath.basename(module.filename));

export type AsyncGeneratorFunction<I = any, O = any, R = any, N = any, L extends number = 0 | 1> = (...args: L extends 1 ? [AsyncIterable<I>] : L extends 0 ? [] : [AsyncIterable<I>, ...AnyParameters]) => AsyncGenerator<O, R, N>;

export type AsyncGeneratorSourceFunction<O = any, R = any, N = any> = AsyncGeneratorFunction<never, O, R, N, 0>;

export type AsyncGeneratorTransformFunction<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;

export type PipelineSource<I = any, R = any, N = any> = Iterable<I, R, N> | AsyncIterable<I, R, N>;
export type PipelineSourceFunction<I = any, R = any, N = any> = Function<AnyParameters, PipelineSource<I, R, N>>;// AsyncFunction<AnyParameters, PipelineSource<I, R, N>> | Function<AnyParameters, PipelineSource<I, R, N>>;
export type PipelineItemFunctionStage<I = any, O = any> = MaybeAsyncFunction<[I/* , ...AnyParameters */], O>;
export type PipelineFunctionStage<I = any, O = any, R = any, N = any> = (source: AsyncIterable<I>) => AsyncIterable<O, R, N>;//AsyncFunction<[PipelineSource<I, R, N>/* , ...AnyParameters */], PipelineSource<O>>;
export type PipelineGeneratorStage<I = any, O = any, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, typeof Infinity>;// (source: AsyncIterable<I>) => AsyncGenerator<O, R, N>;
export type PipelineStage<I = any, O = any> = PipelineItemFunctionStage<I, O> /* | PipelineFunctionStage<I, O> */ | PipelineGeneratorStage<I, O>;
export type PipelineSink<I = any, O = any, R = any, N = any> = AsyncGeneratorTransformFunction<I, O, R, N>;   //Promise<R>;//(source: AsyncGenerator<I, R, N>) => <BulkWriteResult[]>;
export type Pipeline<I = any, O = any, R = any, N = any> = PipelineGeneratorStage<I, O, R, N>;

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
            const returnItem = await stage(item as I);
            log(`Task.pipe(): item=${inspect(item)} pipeResult=${inspect(returnItem)}`);
            yield returnItem;
        }
    };

export const makeAsyncGenerator = <I = any, R = any, N = any>(source: Iterable<I, R, undefined> | AsyncIterable<I, R, undefined>): AsyncGenerator<I, void, any> => 
    isAsyncIterable(source) ? (async function* (asyncIterable: AsyncIterable<I, R, undefined>) {
        for await (const item of asyncIterable) {
            yield item;
        }
    })(source) : (async function* (syncIterable: Iterable<I, R, undefined>) {
        for (const item of syncIterable) {
            yield item;
        }
    })(source);

export const pipe = <I = any, O = void>(
    source: PipelineSource<I> | PipelineSourceFunction<I>,
    ...stages: 
        [PipelineStage<I, O>] |
        [PipelineStage<I, any>, ...PipelineStage<any, any>[], PipelineStage<any, O>]
) => {
    source = isFunction(source) ? source() : source;
    const asyncSource = isAsyncIterable(source) ? source : isIterable(source) ? makeAsyncGenerator(source) : source;
    const stagesAsGenerators = stages.map(stage => isAsyncGeneratorFunction(stage) ? stage : makeAsyncGeneratorFunction(stage as PipelineItemFunctionStage) as AsyncGeneratorFunction);
    log(`Task.pipe(): source=${inspect(source)}\nisIterable=${isIterable(source)} isAsyncIterable=${isAsyncIterable(source)} isAsyncGeneratorFunction=${isAsyncGeneratorFunction(source)}\nasyncSource=${inspect(asyncSource)}\nisIterable=${isIterable(asyncSource)} isAsyncIterable=${isAsyncIterable(asyncSource)} isAsyncGeneratorFunction=${isAsyncGeneratorFunction(asyncSource)}\nTask.pipe(): stages=${inspect(stages)}: ${inspect(stages.map(s => s.toString()))}`);
    const p = stagesAsGenerators.reduce((r, stageGen, i, arr) => stageGen(r), asyncSource);
    return isAsyncGeneratorFunction(p) ? p : makeAsyncGenerator(p);
};

export const tap = <I = any>(fn: (input: I) => Promise<void>) => async (input: I) => { await fn(input); };
export const iff = <I = any, O = any>(condition: MaybeAsyncFunction<[I], boolean>, stage: PipelineItemFunctionStage<I, O>) => makeAsyncGeneratorFunction(
    async (input: I, ...args: AnyParameters) => (await condition(input) ? stage(input/* , ...args */) : input));
export const exists = <I = any>(propertyPath: string) => (input: I) => !!get(input as ObjectWithProperties, propertyPath);


// export function onFinishIteration(input: AsyncIterator<any>, onFinish: () => void): AsyncIterator<any>;
// export function onFinishIteration(input: AsyncIterable<any>, onFinish: () => void): AsyncIterable<any>;
// export function onFinishIteration<T extends AsyncIterator<any> | AsyncIterable<any>>(input: T, onFinish: () => void): T {
export function onFinishIteration<T>(input: AsyncIterable<T>, onFinish: () => void): AsyncIterable<T> {
    return ({
        [Symbol.asyncIterator]() {
            const it = input[Symbol.asyncIterator]();
            return ({
                ...it,
                async next(...args: [] | [any]) {
                    const value = await it.next(...args);
                    if (value.done) {
                        process.nextTick(onFinish);
                    }
                    return value;
                },
            });
        },
    });
}

export const interval = async function* interval(timeoutMs: number, cancel?: AbortSignal): AsyncGenerator<any, any, undefined> {
    while (true) {
        await Task.delay(timeoutMs);
        if (cancel?.aborted) {
            break;
        }
        yield interval.YieldResult;
    }
};
interval.YieldResult = {};

export type MergeOptions = {
    closeAllOnError: boolean;
};
const MergeOptions = makeDefaultOptions<MergeOptions>({
    closeAllOnError: true,
});

export const merge = async function* merge<I = any>(sources: AsyncIterable<I>[], secondarySources: AsyncIterable<I>[] = []): AsyncGenerator<I, any, undefined> {
    let done = false;
    const numSources = sources.length;
    let numSettled = 0, itemCount = 0;
    const its = sources.concat(...secondarySources).map(s => s[Symbol.asyncIterator]());
    let prs = its.filter(it => it).map((it, i) => it.next().then(value => onResolve(value, i)));//.catch(err => { throw err; }));
    log(`merge(): numSources=${numSources} its=${inspect(its)}\nprs=${inspect(prs)}`);
    function onResolve(value: IteratorResult<I, any>, i: number) {
        log(`merge(): onResolve(): value=${inspect(value)} i=${i} numSettled=${numSettled}`);
        let newPr: Promise<IteratorResult<I, any>>;
        if (value.done) {
            if (++numSettled === numSources) {
                done = true;
            }
                // its[i].return?.(value);
            newPr = new Promise((resolve, reject) => {});  // that input has finished, set it's next promise to one that never resolves
        } else {
            newPr = its[i].next().then(value => onResolve(value, i));
        }
        prs = [...prs.slice(0, i), newPr, ...prs.slice(i+1, numSources)];
        return value;
    }
    while (!done) {
        const item = await Promise.race(prs);
        log(`merge(): yielding #${++itemCount} item.value=${inspect(item.value)}`);
        yield item.value;
    }
};

export type BatchOptions = {
    maxSize: number;
    timeoutMs: number;
};
export const BatchOptions = makeDefaultOptions<BatchOptions>({
    maxSize: 10,
    timeoutMs: 200,
});

// This seems to cause my pipe() approach to loop infinitely??? TODO: Fix
export const batch = async function* batch<I = any>(optionsOrSource: BatchOptions | AsyncIterable<I>, sourceOrOptions?: AsyncIterable<I> | BatchOptions) {
    let batch: I[] = [];
    let options: BatchOptions;
    let source: AsyncIterable<I>;
    if (isAsyncIterable(optionsOrSource)) {
        source = optionsOrSource;
        options = BatchOptions.mergeDefaults((sourceOrOptions ?? {} ) as BatchOptions);
    } else {
        source = sourceOrOptions as AsyncIterable<I>;
        options = BatchOptions.mergeDefaults(optionsOrSource);
    }
    const cancelInterval = new AbortController();
    for await (const item of merge(
        [onFinishIteration(source, () => cancelInterval.abort())],
        [interval(options.timeoutMs, cancelInterval.signal)]
    )) {
        if (item === interval.YieldResult) {
            if (batch.length > 0) {
                yield batch;
                batch = [];
            }
        } else {
            batch.push(item);
            if (batch.length === options.maxSize) {
                yield batch;
                batch = [];
            }
        }
    }
    log(`batch(): Returning (batch=${inspect(batch)}) ...`);
};

// export const cargo = async function* <I = any>(maxBatchSize: number, timeoutMs: number, source: AsyncGenerator<I>) {
//     let batch: I[] = [];
//     let intervalGen = interval(timeoutMs);
//     let intervalPr = intervalGen.next();
//     let sourceGen = source;
//     let inputPr = sourceGen.next();
//     let r = { done: false };
//     while (!r.done) {
//         const r = await Promise.race([intervalPr, inputPr]);
//         if (r.value === interval.YieldResult && batch.length > 0) {
//             yield batch;
//             batch = [];
//             intervalPr = intervalGen.next();
//         } else {
//             if (batch.length === maxBatchSize) {
//                 yield batch;
//                 batch = [];
//                 intervalPr = intervalGen.next();
//             }
//             batch.push(r.value);
//         }
//     }
// };

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
