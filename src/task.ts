import * as nodePath from "node:path";
import { inspect } from "node:util";
import { isAsyncFunction } from "node:util/types";

import { AnyParameters, Function, getFunctionName, isAsyncGenerator, isFunction, makeDefaultOptions } from "./models";
import { Progress } from "./progress";
import { PipelineInput, PipelineStage, Pipeline, pipe, tap } from "./pipeline";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type TaskType = "run" | "repeat" | "pipe";
export type TaskFn<TArgs extends TaskFnParams = [], TResult = void> = (task: Task<TArgs>/* , ...args: TArgs */) => Promise<TResult>;
export type TaskFnParams = AnyParameters;// [] | [Task, ...any[]];

export type TaskError = Error | string | unknown;
export type TaskWarning = Error | string | unknown;

export type TaskOptions<TArgs extends TaskFnParams = [], TResult = any> = Partial<{
    type: TaskType;    // corresponds to executions via one of these named functions in Task<>. May want separate discriminated types with specific fields eventually e.g. fn source, pipe stages source
    name?: string;
    parentTask: Task<any, any>;
    progress: Progress;
    history: Task<TArgs, TResult>[];
    errors: Array<TaskError>;
    warnings: Array<TaskWarning>;
}>;
export const TaskOptions = makeDefaultOptions<TaskOptions<TaskFnParams, any>>({
    name: undefined,
    parentTask: undefined,
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

export const TaskPipeOptions = makeDefaultOptions<{}>({});

export type LogFunction<T = any> = (msg: T) => any;

export class TaskExecution<TArgs extends TaskFnParams = [], TResult = any> {
    constructor(
        public readonly name: string,
        public readonly type: "run" | "repeat" | "pipe",    // corresponds to executions via one of these named functions in Task<>. May want separate discriminated types with specific fields eventually e.g. fn source, pipe stages source
        public readonly args: TArgs,
        public readonly progress: Progress,
        public readonly result: TResult | undefined,
        public readonly errors: Array<TaskError>,
        public readonly warnings: Array<TaskWarning>,
        public readonly duration: number,
        public readonly createTime: Date,
        public readonly startTime?: Date,
        public readonly finishTime?: Date | undefined,
    ) {}
}

export class Task<TArgs extends TaskFnParams = [], TResult = any> {

    #taskAnonIdNum = 0;

    #taskPr: Promise<TResult> | null = null;
    #result: TResult | null = null;

    public readonly taskFn: TaskFn<TArgs, TResult>;
    // public readonly options: TaskOptions;
    public readonly type?: TaskType; // undefined until run() repeat() or pipe() are called
    public readonly name: string;
    public readonly parentTask?: Task<any, any>;
    public get nameOrParentName(): string { return this.name ?? (this.parentTask ? this.parentTask.nameOrParentName : this.name); }
    public get id(): string { return (this.parentTask ? this.parentTask.id + "." : "") + this.name; }
    public readonly createdTime: Date;
    #startedTime?: Date;
    public get startedTime() { return this.#startedTime; }
    public set startedTime(value: Date | undefined) { this.#startedTime = value; }
    #finishTime?: Date;
    public get finishTime() { return this.#finishTime; }
    public set finishTime(value: Date | undefined) { this.#finishTime = value; }
    public readonly progress: Progress;
    public readonly errors: Array<TaskError>;
    public readonly warnings: Array<TaskWarning>;
    public readonly history: Task<TArgs, TResult>[];// TaskExecution[] = [];

    public get hasResult() { return this.#taskPr !== null && this.#result !== null; }
    public get result() { return this.#taskPr; }
    public get isComplete() { return this.progress.total && this.progress.count && this.progress.total > 0 ? this.progress.count >= this.progress.total : false; }
    public get hasStarted() { return this.#taskPr !== null; }
    public get hasFinished() { return this.#result !== null; }
    public get runCount() { return this.history.filter(t => t.type === "run").length; }
    public get repeatCount() { return this.history.filter(t => t.type === "repeat").length; }
    public get pipeCount() { return this.history.filter(t => t.type === "pipe").length; }
    
    public log<T = any>(fn: Function<any[], any>, msg: T): void;
    public log<T = any>(msg: T): void;
    public log<T = any>(fnOrMsg: Function<any[], any> | T, msg?: T): void {
        return log(`Task(id=\"${this.nameOrParentName}\")` + (isFunction(fnOrMsg) || isAsyncFunction(fnOrMsg) ? "." + getFunctionName(fnOrMsg as Function<any[], any>) : "") + `: ${msg ?? fnOrMsg}`);
    }
    pipeLogger(logger: LogFunction = this.log) {
        return tap(async (msg: any) => logger(`Task(id=\"${this.nameOrParentName}\").pipe: ${inspect(msg)}`));
    }
    
    constructor(taskFn: TaskFn<TArgs, TResult> | [string, TaskFn<TArgs, TResult>], options?: TaskOptions<TArgs, TResult>) {
        options = TaskOptions.mergeDefaults(options);
        if (Array.isArray(taskFn)) {
            if (taskFn.length !== 2) {
                throw new Error(`new Task(): taskFn can be an array but must have length 2 and consist of [string, taskFn]: taskFn=${inspect(taskFn)}`);
            }
            this.taskFn = Object.defineProperty(taskFn[1], "name", { value: options.name ?? taskFn[0] });
        } else {
            this.taskFn = taskFn;
        }
        this.parentTask = options.parentTask;
        if (this.parentTask) {
            this.progress = this.parentTask?.progress;
        }
        this.name = getFunctionName(this.taskFn, this.nameOrParentName + `#${++this.#taskAnonIdNum}`, "(anon)");
        log(`new Task(taskFn.name=\"${this.taskFn.name}\" options=${inspect(options)})`);
        this.progress = options.progress ?? new Progress(this.name);
        this.history = options.history ?? [];
        this.errors = options.errors ?? [];
        this.warnings = options.warnings ?? [];
        this.createdTime = new Date();
    }

    then(...args: Parameters<typeof Promise.prototype.then>) { return this.#taskPr?.then(...args); }
    catch(...args: Parameters<typeof Promise.prototype.catch>) { return this.#taskPr?.catch(...args); }
    finally(...args: Parameters<typeof Promise.prototype.finally>) { return this.#taskPr?.finally(...args); }

    #startExecution() {
        this.startedTime = new Date();
        this.progress?.reset();
        this.history.push({ ...this });
    }
    #finishExecution() {
        this.finishTime = new Date();   // should be the same referenced value in this.history too ?
    }

    #run(...args: TArgs) {
        this.#startExecution();
        this.#taskPr = this.taskFn(this/* , ...args */)
            .then(async result => {
                this.#result = result ?? {} as TResult;
                this.#finishExecution();
                this.log(this.#run, `result=${inspect(result)} isAsyncGenerator=${isAsyncGenerator(this.#result)}`);
                if (isAsyncGenerator(this.#result)) {
                    // is this OK to use for await / async fn inside of a .then?
                    for await (const item of this.#result[Symbol.asyncIterator]()) {    // does this create a new AsyncGenerator instance? does that mean I can return this.#result and that is still usable (not iterated)?
                        this.log(this.#run, `item=${inspect(item)}`);
                    }
                }
                return this.#result;
            });
        this.log(this.#run, `this.#taskPr=${this.#taskPr} returning sync flow...`);
        return this;
    }
    public runAll(...taskFns: (TaskFn<[], any> | [string, TaskFn<[], any>])[]) {
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
            return new Task(_taskFn, { ...this as TaskOptions, parentTask: this }).#run();
        }));
    }
    public static runAll(...taskFns: (TaskFn<[], any> | [string, TaskFn<[], any>])[]) {
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
    async #repeat(options: TaskOptions<TArgs, TResult> & TaskRepeatOptions, ...args: TArgs) {
        TaskRepeatOptions.applyDefaults(options);
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
    public async repeat<TArgs extends TaskFnParams, TResult extends any>(options: TaskOptions<TArgs, TResult> & TaskRepeatOptions, taskFn: TaskFn<TArgs, TResult>, ...args: TArgs) {
        return new Task<TArgs, TResult>(taskFn, { ...options, parentTask: this, }).#repeat(options, ...args);
    }

    public static async repeat<TArgs extends TaskFnParams, TResult extends any>(options: TaskOptions<TArgs, TResult> & TaskRepeatOptions, taskFn: TaskFn<TArgs, TResult>, ...args: TArgs) {
       return new Task<TArgs, TResult>(taskFn, options).#repeat(options, ...args);
    }

    async #pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, T6 = any, T7 = any, T8 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
        stage5?: PipelineStage<T5, T6, any>,
        stage6?: PipelineStage<T6, T7, any>,
        stage7?: PipelineStage<T7, T8, any>,
    ): Promise<Pipeline<T0, T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8, R>> {
        this.#startExecution();
        const result = pipe(source, stage0, stage1, stage2, stage3, stage4, stage5, stage6, stage7);
        this.#finishExecution();
        return result;
    }
    public static async pipe<T0 = any, T1 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1, R>): Promise<Pipeline<T0, T1, R>>;
    public static async pipe<T0 = any, T1 = any, T2 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): Promise<Pipeline<T0, T2, R>>;
    public static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): Promise<Pipeline<T0, T3, R>>;
    public static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): Promise<Pipeline<T0, T4, R>>;
    public static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineInput<T0>, stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5, R>): Promise<Pipeline<T0, T5, R>>;
    public static async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
    ): Promise<Pipeline<T0, T1 | T2 | T3 | T4 | T5, R>> {
        log(`Task.pipe(): source=${inspect(source)} stages=${inspect([stage0, stage1, stage2, stage3, stage4])}`);
        return new Task(async () => {}).#pipe(source, stage0, stage1, stage2, stage3, stage4);
    }
    public async pipe<T0 = any, T1 = any, R = void>(source: PipelineInput<T0>/*  | PipelineCountedInput<T0> */, stage0: PipelineStage<T0, T1, R>): Promise<Pipeline<T0, T1, R>>;
    public async pipe<T0 = any, T1 = any, T2 = any, R = void>(source: PipelineInput<T0>/*  | PipelineCountedInput<T0> */, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2, R>): Promise<Pipeline<T0, T2, R>>;
    public async pipe<T0 = any, T1 = any, T2 = any, T3 = any, R = void>(source: PipelineInput<T0>/*  | PipelineCountedInput<T0> */, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3, R>): Promise<Pipeline<T0, T3, R>>;
    public async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, R = void>(source: PipelineInput<T0>/*  | PipelineCountedInput<T0> */, stage0: PipelineStage<T0, T1>, stage1: PipelineStage<T1, T2>, stage2: PipelineStage<T2, T3>, stage3: PipelineStage<T3, T4, R>): Promise<Pipeline<T0, T4, R>>;
    public async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(source: PipelineInput<T0>/*  | PipelineCountedInput<T0> */, stage0: PipelineStage<T0, T1>, stage1?: PipelineStage<T1, T2>, stage2?: PipelineStage<T2, T3>, stage3?: PipelineStage<T3, T4>, stage4?: PipelineStage<T4, T5, R>): Promise<Pipeline<T0, T5, R>>;
    public async pipe<T0 = any, T1 = any, T2 = any, T3 = any, T4 = any, T5 = any, R = void>(
        source: PipelineInput<T0>,
        stage0: PipelineStage<T0, T1, any>,
        stage1?: PipelineStage<T1, T2, any>,
        stage2?: PipelineStage<T2, T3, any>,
        stage3?: PipelineStage<T3, T4, any>,
        stage4?: PipelineStage<T4, T5, any>,
    ) {
        this.log(this.pipe, `source=${inspect(source)} progress=${this.progress} stages=${inspect([stage0, stage1, stage2, stage3, stage4])}`);
        return this.#pipe(
            source,
            // tap(_ => this.progress.incrementTotal()),
            stage0,
            stage1,
            stage2,
            stage3,
            stage4,
            // tap(_ => this.progress.incrementCount()),
        );
    }
}
