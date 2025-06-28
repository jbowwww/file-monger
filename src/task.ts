import * as nodePath from "node:path";
import { inspect } from "node:util";
import { isAsyncFunction } from "node:util/types";

import { Function, getFunctionName, isFunction, makeDefaultOptions } from "./models";
import { Progress } from "./progress";
import { makeAsyncGenerator, PipelineSource as PipelineInput, PipelineStage, Pipeline, pipe, isAsyncGenerator, tap } from "./pipeline";
import { Timestamps } from "./models/timestamped";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type TaskFn<TArgs extends TaskFnParams = [], TResult = void> = (task: Task<TArgs>/* , ...args: TArgs */) => Promise<TResult>;
export type TaskFnParams = [] | [Task, ...any[]];

export type TaskError = Error | string | unknown;
export type TaskWarning = Error | string | unknown;

export type TaskOptions = Partial<{
    parentTask: Task<any, any>;
    name?: string;
    progress: Progress;
    history: TaskRunResult<any>[];
    errors: Array<TaskError>;
    warnings: Array<TaskWarning>;
}>;
export const TaskOptions = makeDefaultOptions<TaskOptions>({
    parentTask: undefined,
    name: undefined,
    progress: new Progress(),
    history: [],
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

export type TaskRunResult<T> = {
    value?: T;
} & Timestamps<{ start: false; finish: false; }>;

export const TaskPipeOptions = makeDefaultOptions<{}>({});

export type LogFunction<T = any> = (msg: T) => any;

export class Task<TArgs extends TaskFnParams = [], TResult = any> {

    #taskAnonIdNum = 0;

    #taskPr: Promise<TResult> | null = null;
    #result: TResult | null = null;
    #repeatCount: number = 0;

    public readonly taskFn: TaskFn<TArgs, TResult>;
    public readonly options: TaskOptions;
    public readonly parentTask?: Task<any, any>;
    public readonly name: string;
    public get nameOrParentName(): string { return this.name ?? (this.parentTask ? this.parentTask.nameOrParentName : this.name); }
    public get id(): string { return (this.parentTask ? this.parentTask.id + "." : "") + this.name; }
    public readonly progress: Progress;
    public readonly created: Date;
    public readonly history: TaskRunResult<TResult>[];
    public readonly errors: Array<TaskError>;
    public readonly warnings: Array<TaskWarning>;

    public get hasResult() { return this.#taskPr !== null && this.#result !== null; }
    public get result() { return this.#taskPr; }
    public get complete() { return this.progress.total > 0 && this.progress.count >= this.progress.total; }
    public get hasStarted() { return this.#taskPr !== null; }
    public get hasFinished() { return this.#result !== null; }
    private set runCount(value: number) { this.#repeatCount = value; }
    public get runCount() { return this.#repeatCount; }

    public log<T = any>(fn: Function<any[], any>, msg: T): void;
    public log<T = any>(msg: T): void;
    public log<T = any>(fnOrMsg: Function<any[], any> | T, msg?: T): void {
        return log(`Task(id=\"${this.nameOrParentName}\")` + (isFunction(fnOrMsg) || isAsyncFunction(fnOrMsg) ? "." + getFunctionName(fnOrMsg as Function<any[], any>) : "") + `: ${msg ?? fnOrMsg}`);
    }
    pipeLogger(logger: LogFunction = this.log) {
        return tap(async (msg: any) => logger(`Task(id=\"${this.nameOrParentName}\").pipe: ${inspect(msg)}`));
    }
    
    constructor(taskFn: TaskFn<TArgs, TResult> | [string, TaskFn<TArgs, TResult>], options?: TaskOptions) {
        this.options = TaskOptions.mergeDefaults(options);
        if (Array.isArray(taskFn)) {
            if (taskFn.length !== 2) {
                throw new Error(`new Task(): taskFn can be an array but must have length 2 and consist of [string, taskFn]: taskFn=${inspect(taskFn)}`);
            }
            this.taskFn = Object.defineProperty(taskFn[1], "name", { value: this.options.name ?? taskFn[0] });
        } else {
            this.taskFn = taskFn;
        }
        this.parentTask = this.options.parentTask;
        this.name = getFunctionName(this.taskFn, this.nameOrParentName + `#${++this.#taskAnonIdNum}`, "(anon)");
        log(`new Task(taskFn.name=\"${this.taskFn.name}\" options=${inspect(options)} this.options=${inspect(this.options)})`);
        this.progress = this.options.progress ?? new Progress(this.name);
        this.history = this.options.history ?? [];
        this.errors = this.options.errors ?? [];
        this.warnings = this.options.warnings ?? [];
        this.created = new Date();
    }

    then(...args: Parameters<typeof Promise.prototype.then>) { return this.#taskPr?.then(...args); }
    catch(...args: Parameters<typeof Promise.prototype.catch>) { return this.#taskPr?.catch(...args); }
    finally(...args: Parameters<typeof Promise.prototype.finally>) { return this.#taskPr?.finally(...args); }

    #run(...args: TArgs) {
        const start = new Date();
        this.progress?.reset();
        this.runCount++;
        this.#taskPr = this.taskFn(this/* , ...args */)
            .then(async result => {
                this.#result = result ?? {} as TResult;
                this.log(this.#run, `result=${inspect(result)} isAsyncGenerator=${isAsyncGenerator(this.#result)}`);
                if (isAsyncGenerator(this.#result)) {
                    // is this OK to use for await / async fn inside of a .then?
                    for await (const item of this.#result[Symbol.asyncIterator]()) {    // does this create a new AsyncGenerator instance? does that mean I can return this.#result and that is still usable (not iterated)?
                        this.log(this.#run, `item=${inspect(item)}`);
                    }
                }
                this.history.push({ value: result, start, finish: new Date(), });
                return this.#result;
            });
        this.log(this.#run, `this.#taskPr=${this.#taskPr} returning sync flow...`);
        return this;
    }
    public run(...taskFns: (TaskFn<TaskFnParams, any> | [string, TaskFn<TaskFnParams, any>])[]) {
        return Promise.all(taskFns.map(taskFn => {
            let _taskFn: TaskFn<[], void>;
            if (Array.isArray(taskFn)) {
                if (taskFn.length !== 2) {
                    throw new Error(`new Task(): taskFn can be an array but must have length 2 and consist of [string, taskFn]: taskFn=${inspect(taskFn)}`);
                }
                _taskFn = Object.defineProperty(taskFn[1], "name", { value: taskFn[0] });
            } else {
                _taskFn = taskFn;
            }
            return new Task(taskFn, { ...this.options, parentTask: this }).#run();
        }));
    }
    public static run(...taskFns: (TaskFn<TaskFnParams, any> | [string, TaskFn<TaskFnParams, any>])[]) {
        return Promise.all(taskFns.map(taskFn => new Task(taskFn).#run()));
    }

    public async delay(ms: number) {
        this.log(this.delay);
        return await new Promise((resolve, reject) => setTimeout(resolve, ms));
    }
    public static async delay(ms: number) {
        log(`Task.delay(${ms})`);
        return await new Promise((resolve, reject) => setTimeout(resolve, ms));
    }

    // TODO: Make task's TReturn optionanlly a { value: any, done: boolean, } type of deal to break out of loop?
    async #repeat(options: TaskOptions & TaskRepeatOptions, ...args: TArgs) {
        options = { ...TaskOptions.default, ...TaskRepeatOptions.default, ...options };
        log(this.#repeat, `options=${inspect(options)} args=${inspect(args)}`);
        let result: TResult;
        while (options.abort ? options.abort.signal.aborted : true) {
            if (options.preDelay && options.preDelay > 0) {
                await Task.delay(options.preDelay);
            }
            result = await this.#run(...args);
            if (options.postDelay && options.postDelay > 0) {
                await Task.delay(options.postDelay);
            };
        }
        return this;
    }
    public async repeat<TArgs extends TaskFnParams, TResult extends any>(options: TaskOptions & TaskRepeatOptions, taskFn: TaskFn<TArgs, TResult>, ...args: TArgs) {
        return new Task<TArgs, TResult>(taskFn, { ...options, parentTask: this, }).#repeat(options, ...args);
    }

    public static async repeat<TArgs extends TaskFnParams, TResult extends any>(options: TaskOptions & TaskRepeatOptions, taskFn: TaskFn<TArgs, TResult>, ...args: TArgs) {
       return new Task<TArgs, TResult>(taskFn, options).#repeat(options, ...args);
    }

    static async #pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
    ): Promise<Pipeline<T0, T1 | T2 | T3 | T4 | T5, R>> {
        return pipe(makeAsyncGenerator(source), stage0, stage1!, stage2!, stage3!, stage4!);
    }
    static async pipe<T0 = any, T1 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1, R>): Promise<Pipeline<T0, T1, R>>;
    static async pipe<T0 = any, T1 = any, T2 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): Promise<Pipeline<T0, T2, R>>;
    static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): Promise<Pipeline<T0, T3, R>>;
    static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): Promise<Pipeline<T0, T4, R>>;
    static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5, R>): Promise<Pipeline<T0, T5, R>>;
    public static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
    ): Promise<Pipeline<T0, T1 | T2 | T3 | T4 | T5, R>> {
        log(`Task.pipe(): source=${inspect(source)} stages=${inspect([stage0, stage1, stage2, stage3, stage4])}`);
        return Task.#pipe(source, stage0, stage1, stage2, stage3, stage4);
    }
    public async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
    ): Promise<Pipeline<T0, T1 | T2 | T3 | T4 | T5, R>> {
        this.log(this.pipe, `source=${inspect(source)} stages=${inspect([stage0, stage1, stage2, stage3, stage4])}`);
        return Task.#pipe(source, stage0, stage1, stage2, stage3, stage4);
    }
}
