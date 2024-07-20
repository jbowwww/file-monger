import { isAsyncIterable, isIterable } from "./types";

export type Stage<TIn = any, TOut = any> = (arg: TIn) => TOut | Promise<TOut> | void | Promise<void>;
export type Test<T = any> = (obj: T) => boolean;
export type TypeGuard<T> = (obj: any) => obj is T;

export type PipelineClosureFunction<T = any> = (pipe: Pipeline<T>) => void | Promise<void>;
export type SingleOrIterablePipelineInput<T> = T | Iterable<T> | AsyncIterable<T>;
export type QueuedPipelineInputFunction<T> = (() => T | Iterable<T> | AsyncIterable<T>);

export const isQueuedPipelineInputFunction = <T>(obj: any): obj is QueuedPipelineInputFunction<T> =>
    typeof obj === 'function' && (obj as Function).length === 0;

export class Pipeline<TInput> {

    _pipeline: (arg: TInput) => any = arg => arg;
    _sources: Array<SingleOrIterablePipelineInput<TInput> | QueuedPipelineInputFunction<TInput>> = [];

    // stages: Array<Stage> = [];

    // Building the pipeline within this close function allows the pipeline to reference itself
    // This, for one thing, allows pipeline stages to call pipe.run() to generate data for itself e.g. recursing file system walks
    constructor(pipelineClosure?: PipelineClosureFunction<TInput>) {
        if (pipelineClosure !== undefined)
            pipelineClosure(this);
    }

    run<TOutput>(input: TInput): TOutput | Promise<TOutput> {
        return this._pipeline(input);
    }

    // "Compiles" the pipeline from this.stages and executes it using each value the Iteratable or AsyncIterable source yields (also re-yields each output value)
    async* iterate<TOutput>(source: TInput | Iterable<TInput> | AsyncIterable<TInput>) {
        // const compiledPipeline = (arg: TInput) => this.stages.reduce(async (arg, stage) => await stage(arg), source as any) as TOutput;
        for (
            let s: SingleOrIterablePipelineInput<TInput> | QueuedPipelineInputFunction<TInput> | undefined = source;
            s !== undefined;
            s = this._sources.shift()
        ) {
            if (isQueuedPipelineInputFunction(s)) {
                s = s();
            }
            if (isIterable(s)) {
                for (const arg of s) {
                    yield this.run(arg);
                }
                // return this;// as any as Generator<TOutput>;    // NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
            } else if (isAsyncIterable(s)) {
                for await (const arg of s) {
                    yield* await this._pipeline(arg);
                }
                // return this;// as any as AsyncGenerator<TOutput>;// NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
            } else {
                yield await this._pipeline(s);
            }
        }
    }

    enqueue(source: TInput | Iterable<TInput> | AsyncIterable<TInput> | QueuedPipelineInputFunction<TInput>) {
        this._sources.push(source);
    }

    // (potentially async) map function
    enrich<TOutput = TInput>(stage: (arg: TInput) => TOutput | Promise<TOutput>) {
        const _pipeline = this._pipeline;
        this._pipeline = (arg: TInput) => { const data = _pipeline(arg); return ({ ...data, ...(stage(data) ?? {}) }); };//stages.push(stage);
        return this as any as Pipeline<TInput & TOutput>;    // NOTE: is this the legit approach to do this?? keep a close eye on here... //as<TOutput>();
    }
 
    // Branching
    tap(output: (obj: TInput) => void) {
        return this.enrich(arg => { output(arg); return arg; });
    }

    // Conditional branching
    // Can be used for type switching by using type guard functions for the 'test' parameter
    if<TOutput extends TInput = TInput>(
        test: TypeGuard<TOutput> | Test<TInput>,
        onTrue: Stage<TInput, TOutput> /* | PipelineClosureFunction<TInput> */,
        onFalse?: Stage<TInput, TOutput> /* | PipelineClosureFunction<TInput> */,// = pipe => ((arg: TInput) => ({}))// arg as TOutput
    ) {
        return this.enrich(arg => test(arg) ? onTrue(arg) : onFalse?.(arg));
    }

    // input / insertion points? 
    
    // Piping iterables

    // ...
}