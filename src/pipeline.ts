import { isAsyncFunction, isGeneratorFunction } from "node:util/types";
import { get, ObjectWithProperties } from "./prop-path";


export type AsyncGeneratorFunction<I = unknown, O = unknown, R = any, N = any, L extends 0 | 1 = 0 | 1> = (...args: L extends 1 ? [AsyncIterable<I/* , R, N */>] : []) => AsyncGenerator<O, R, N>;

export type AsyncGeneratorSourceFunction<O = unknown, R = any, N = any> = AsyncGeneratorFunction<never, O, R, N, 0>;

export type AsyncGeneratorTransformFunction<I = unknown, O = unknown, R = any, N = any> = AsyncGeneratorFunction<I, O, R, N, 1>;

export type PipelineFunctionStage<I = any, O = any> = (input: I) => O | Promise<O>;
export type PipelineGeneratorStage<I = any, O = any> = (source: AsyncIterable<I>) => AsyncGenerator<O>;
export type PipelineStage<I = any, O = any> = PipelineFunctionStage<I, O> | PipelineGeneratorStage<I, O>;
export type Pipeline<I = any, O = any> = PipelineGeneratorStage<I, O>;

// export type Pipeline<I = any, O = any> = (source: AsyncGenerator<I>) => AsyncGenerator<O> & {
//     run(source: AsyncGenerator<I>): AsyncGenerator<O>;
// }

export const makeGeneratorFnFromFn = <I = any, O = any>(stage: PipelineFunctionStage<I, O | Promise<O>>) =>
    async function* generatorStage(source: AsyncGenerator<I>) {
        for await (const input of source) {
            yield await stage(input) as O;
        }
    };

export const isAsyncGenerator = <T = unknown, R = any, N = any>(generator: any): generator is AsyncGenerator<T, R, N> =>
    (["next", "return", "throw", Symbol.asyncIterator]).every(prop => typeof prop === "function");
export const isAsyncGeneratorFunction = <I = any, O = any, R = any, N = any, L extends 0 | 1 = 0 | 1>(generatorFn: any, argumentsLength?: 0 | 1): generatorFn is AsyncGeneratorFunction<I, O, N, L> =>
    isAsyncGenerator<O, any, N>(generatorFn.prototype) && (!argumentsLength || generatorFn.length === argumentsLength);
export const isAsyncGeneratorSourceFunction = <O = unknown, R = any, N = any>(generatorFn: any): generatorFn is AsyncGeneratorFunction<never, O, R, N> => isAsyncGeneratorFunction(generatorFn.prototype, 0)
export const isAsyncGeneratorTransformFunction = (generatorFn: any): generatorFn is AsyncGeneratorFunction => isAsyncGenerator(generatorFn.prototype);

// export const compose = <I = any, O = any>(...stages: PipelineFunctionStage[]) => stages.reduce(
//     (prevStages, stage, i, arr) => async (input: any) => stage(prevStages(await input)) as O | Promise<O>) as Pipeline<I/* , O>;
export const compose = <I = any, O = any>(...stages: PipelineGeneratorStage<any>[]) => (source: AsyncGenerator<I>) =>
    stages.reduce<AsyncGenerator<any>>((prevStages, stage, i, arr) => stage(prevStages), source) as AsyncGenerator<O> /* as Pipeline<I, O> */;

export const pipeline = compose;/*  <I = any, O = any>(...stages: PipelineFunctionStage[]) => {
    const transform = compose<I, O>(...stages);
    return async function* (source: AsyncIterable<I>) {
        for await (const input of source) {
            yield await transform(input);
        }
    };
}; */

export const pipe = <I = any, O = any>(source: AsyncGenerator<I>, ...stages: PipelineFunctionStage[]) => pipeline(...stages)(source);

// export const run =
//     async function* <I = any, O = any>(source: AsyncIterable<I>, pipeline: Pipeline<I, O>): AsyncIterable<O> {
//         for await (const input of source) {
//             yield await pipeline(input);
//         }
//     };

export const iff = <I = any, O = any>(condition: (input: I) => boolean | Promise<boolean>, stage: PipelineFunctionStage<I, O>) =>
        makeGeneratorFnFromFn(
    async (input: I) => (await condition(input) ? await (stage as PipelineFunctionStage<I, O>)(input) : input)
        );
export const exists = <I = any>(propertyPath: string) => (input: I) => !!get(input as ObjectWithProperties, propertyPath);

export const interval = async function* interval(timeoutMs: number): AsyncGenerator<undefined> {
    while (true) {
        await new Promise((resolve, reject) => setTimeout(resolve, timeoutMs));
        yield;
    }
};
interval.YieldResult = {}; //new Object();

export const cargo = async function* <I = any>(maxBatchSize: number, timeoutMs: number, source: AsyncGenerator<I>) {
    let batch: I[] = [];
    let intervalGen = interval(timeoutMs);
    let intervalPr = intervalGen.next();
    let sourceGen = source;
    let inputPr = sourceGen.next();
    let r = { done: false };
    while (!r.done) {
        const r = await Promise.race([intervalPr, inputPr]);
        if (r.value === interval.YieldResult && batch.length > 0) {
            yield batch;
            batch = [];
            intervalPr = intervalGen.next();
        } else {
            if (batch.length === maxBatchSize) {
                yield batch;
                batch = [];
                intervalPr = intervalGen.next();
            }
            batch.push(r.value);
        }
    }
};

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
    }
