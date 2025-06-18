import * as nodePath from "node:path";

import { makeDefaultOptions } from "./models";
import { Progress } from "./progress";

import debug from "debug";
import { genChain, makeAsyncGenerator, PipelineFunction, PipelineSink, PipelineSource as PipelineInput, PipelineStage, Pipeline, pipe } from "./pipeline";
const log = debug(nodePath.basename(module.filename));

export type TaskFn<TArgs extends any[] = [], TResult = void> = (task: Task<TArgs, TResult>, ...args: TArgs) => Promise<TResult>;

export type TaskError = Error | string | unknown;
export type TaskWarning = Error | string | unknown;

export type TaskOptions = Partial<{
    progress: Progress;
    errors: Array<TaskError>;
    warnings: Array<TaskWarning>;
}>;
export const TaskOptions = makeDefaultOptions<TaskOptions>({
    progress: new Progress(),
    errors: [],
    warnings: [],
});

export type TaskRepeatOptions = Partial<{
    preDelay: number;
    postDelay: number;
    abort: AbortController;
}>;
export const TaskRepeatOptions = makeDefaultOptions<TaskRepeatOptions>({
    preDelay: 0,
    postDelay: 0,
    abort: undefined,
});

// export type 
export const TaskPipeOptions = makeDefaultOptions<{}>({});

export class Task<TArgs extends any[] = [], TResult = void> {

    static #taskAnonIdNum = 0;

    #taskPr: Promise<TResult> | null = null;
    #result: TResult | null = null;
    #repeatCount: number = 0;

    public readonly taskFn: TaskFn<TArgs, TResult>;
    public readonly options: TaskOptions;
    public readonly name: string;
    public readonly progress: Progress;
    public readonly errors: Array<TaskError>;
    public readonly warnings: Array<TaskWarning>;

    public get hasResult() { return this.#taskPr !== null && this.#result !== null; }
    public get result() { return this.#taskPr; }
    public get complete() { return this.progress.total > 0 && this.progress.count >= this.progress.total; }
    public get hasStarted() { return this.#taskPr !== null; }
    public get hasFinished() { return this.#result !== null; }
    private set repeatCount(value: number) { this.#repeatCount = value; }
    public get repeatCount() { return this.#repeatCount; }

    constructor(taskFn: TaskFn<TArgs, TResult>, options?: TaskOptions) {
        this.taskFn = taskFn;
        this.options = TaskOptions.mergeDefaults(options);
        this.name = taskFn.name ?? `Task #${++Task.#taskAnonIdNum}`;
        this.progress = this.options.progress ?? new Progress(this.name);
        this.errors = this.options.errors ?? [];
        this.warnings = this.options.warnings ?? [];
    }

    then(...args: Parameters<typeof Promise.prototype.then>) { return this.#taskPr?.then(...args); }
    catch(...args: Parameters<typeof Promise.prototype.catch>) { return this.#taskPr?.catch(...args); }
    finally(...args: Parameters<typeof Promise.prototype.finally>) { return this.#taskPr?.finally(...args); }

    public start(...args: TArgs) {
        this.progress?.reset();
        this.#taskPr = this.taskFn(this, ...args).then(result => this.#result = result ?? {} as TResult);
        return this;
    }
    public static start(...taskFns: TaskFn<[], void>[]) {
        return Promise.all(taskFns.map(taskFn => new Task(taskFn).start()));
    }

    public static async delay(ms: number) {
        return await new Promise((resolve, reject) => setTimeout(resolve, ms));
    }

    // TODO: Make task's TReturn optionanlly a { value: any, done: boolean, } type of deal to break out of loop?
    public async repeat<TReturn extends any>(options: TaskOptions & TaskRepeatOptions, ...args: TArgs) {
        options = { ...TaskOptions.default, ...TaskRepeatOptions.default, ...options };
        while (options.abort ? options.abort.signal.aborted : true) {
            if (options.preDelay && options.preDelay > 0) {
                await Task.delay(options.preDelay);
            }
            await this.start(...args);
            if (options.postDelay && options.postDelay > 0) {
                await Task.delay(options.postDelay);
            };
        }
        return this;
    }
    public static async repeat<TArgs extends any[], TReturn extends any>(options: TaskOptions & TaskRepeatOptions, taskFn: TaskFn<TArgs, TReturn>, ...args: TArgs) {
       return new Task(taskFn, options).repeat(options, ...args);
    }

    pipe<T0 = any, T1 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1, R>): Pipeline<T0, T1, R>;
    pipe<T0 = any, T1 = any, T2 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): Pipeline<T0, T2, R>;
    pipe<T0 = any, T1 = any, T2 = any, T3 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): Pipeline<T0, T3, R>;
    pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): Pipeline<T0, T4, R>;
    pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5, R>): Pipeline<T0, T5, R>;
    public pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
    ): Pipeline<T0, T1 | T2 | T3 | T4 | T5, R> {
        return pipe(makeAsyncGenerator(source), stage0, stage1!, stage2!, stage3!, stage4!);
    }
}
