import { isAsyncFunction, isGeneratorFunction } from "node:util/types";
import { get, ObjectWithProperties } from "./prop-path";

export type AsyncGeneratorFunction<I = any, O = any> = (source: AsyncIterable<I>) => AsyncGenerator<O>;

export type PipelineFunctionStage<I = any, O = any> = (input: I) => O | Promise<O>;
export type PipelineGeneratorStage<I = any, O = any> = (source: AsyncGenerator<I>) => AsyncGenerator<O>;
export type PipelineStage<I = any, O = any> = PipelineFunctionStage<I, O> | PipelineGeneratorStage<I, O>;
export type Pipeline<I = any, O = any> = PipelineFunctionStage<I, O>;

// export type Pipeline<I = any, O = any> = (source: AsyncGenerator<I>) => AsyncGenerator<O> & {
//     run(source: AsyncGenerator<I>): AsyncGenerator<O>;
// }

export const makeGeneratorFromFunction = <I = any, O = any>(stage: PipelineFunctionStage<I, O | Promise<O>>) =>
    async function* generatorStage(source: AsyncGenerator<I>) {
        for await (const input of source) {
            yield await stage(input) as O;
        }
    };

export const isAsyncGenerator = (generator: any): generator is AsyncGenerator => (["next", "return", "throw", Symbol.asyncIterator]).every(prop => typeof prop === "function");
export const isAsyncGeneratorFunction = (generatorFn: any): generatorFn is AsyncGeneratorFunction => isAsyncGenerator(generatorFn.prototype);

export const compose = <I = any, O = any>(...stages: PipelineFunctionStage[]) => stages.reduce(
    (prevStages, stage, i, arr) => (input: any) => stage(prevStages(input)) as O | Promise<O>) as Pipeline<I, O>;

export const pipeline = <I = any, O = any>(...stages: PipelineFunctionStage[]) => {
    const transform = compose<I, O>(...stages);
    return async function* (source: AsyncIterable<I>) {
        for await (const input of source) {
            yield transform(input);
        }
    };
};

export const run =
    async function* <I = any, O = any>(source: AsyncIterable<I>, pipeline: Pipeline<I, O>): AsyncIterable<O> {
        for await (const input of source) {
            yield await pipeline(input);
        }
    };

export const iff = <I = any, O = any>(condition: (input: I) => boolean | Promise<boolean>, stage: PipelineFunctionStage<I, O>) =>
    async (input: I) => (await condition(input) ? await (stage as PipelineFunctionStage<I, O>)(input) : input);
export const exists = <I = any>(propertyPath: string) => (input: I) => !!get(input as ObjectWithProperties, propertyPath);