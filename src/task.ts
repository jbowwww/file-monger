import * as nodePath from "node:path";
import { Progress } from "./progress";

import { makeDefaultOptions } from "./models";
import { PipelineSource, pipe, PipelineStage, PipelineSink, PipelineSourceFunction } from "./pipeline";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type TaskFn<TArgs extends any[] = [], TResult = void> = (task: Task<TArgs, TResult>, ...args: TArgs) => Promise<TResult>;

export type TaskError = Error | string | unknown;
export type TaskWarning = Error | string | unknown;

export type TaskOptions = Partial<{
    progress?: Progress;
    errors?: Array<TaskError>;
    warnings?: Array<TaskWarning>;
}>;
export const TaskOptions: {
    default: TaskOptions;
} = {
    get default() {
        return ({
            progress: new Progress(),
            errors: [],
            warnings: [],
        });
    },
}

export type TaskRepeatOptions = Partial<{
    preDelay: number;
    postDelay: number;
}>;
export const TaskRepeatOptions: {
    default: TaskRepeatOptions;
} = {
    default: {
        preDelay: 0,
        postDelay: 0,
    },
};

// export type 
export const TaskPipeOptions = makeDefaultOptions<{}>({});

export class Task<TArgs extends any[] = [], TResult = void> {

    static #taskAnonIdNum = 0;

    #taskPr: Promise<TResult> | null = null;
    #result: TResult | null = null;

    public readonly name: string;
    public readonly progress: Progress;
    public readonly errors: Array<TaskError>;
    public readonly warnings: Array<TaskWarning>;

    public get hasResult() { return this.#taskPr !== null && this.#result !== null; }
    public get result() { return this.#taskPr; }
    public get complete() { return this.progress.total > 0 && this.progress.count >= this.progress.total; }
    public get hasStarted() { return this.#taskPr !== null; }
    public get hasFinished() { return this.#result !== null; }

    constructor(public readonly taskFn: TaskFn<TArgs, TResult>, public readonly options: TaskOptions = TaskOptions.default) {
        this.name = taskFn.name ?? `Task #${++Task.#taskAnonIdNum}`;
        this.progress = options.progress ?? new Progress(this.name);
        this.errors = options.errors ?? [];
        this.warnings = options.warnings ?? [];
    }

    public start(...args: TArgs) {
        this.progress?.reset();
        return this.#taskPr = this.taskFn(this, ...args).then(result => this.#result = result ?? {} as TResult);
    }

    public static start(...taskFns: TaskFn<[], void>[]) {
        return Promise.all(taskFns.map(taskFn => new Task(taskFn).start()));
    }

    public static async delay(ms: number) {
        return await new Promise((resolve, reject) => setTimeout(resolve, ms));
    }

    public static async repeat<TArgs extends any[], TReturn extends any>(options: TaskOptions & TaskRepeatOptions, taskFn: TaskFn<TArgs, TReturn>, ...args: TArgs) {
        options = { ...TaskOptions.default, ...TaskRepeatOptions.default, ...options };
        while (true) {
            if (options.preDelay && options.preDelay > 0) {
                await Task.delay(options.preDelay);
            }
            await new Task<TArgs, TReturn>(taskFn, options).start(...args);
            if (options.postDelay && options.postDelay > 0) {
                await Task.delay(options.postDelay);
            };
        }
    }

    public async repeat<TSubArgs extends any[] = [], TSubReturn = void>(options: TaskOptions & TaskRepeatOptions, taskFn: TaskFn<TSubArgs, TSubReturn>, ...args: TSubArgs) {
        options = { ...TaskOptions.default, ...TaskRepeatOptions.default, progress: this.progress, ...options };
        return Task.repeat<TSubArgs, TSubReturn>(options, taskFn, ...args);
    }

    public static pipe<O = any, R = any>(
        source: PipelineSource<any> | PipelineSourceFunction<any>,
        ...stages: 
            [PipelineStage<any, O>] |
            [PipelineStage<any, O>, PipelineSink<O, R>] |
            [PipelineStage<any, any>, PipelineStage<any, O>] |
            [PipelineStage<any, any>, PipelineStage<any, O>, PipelineSink<O, R>] |
            [PipelineStage<any, any>, ...PipelineStage<any, any>[], PipelineStage<any, O>] |
            [PipelineStage<any, any>, ...PipelineStage<any, any>[], PipelineStage<any, O>, PipelineSink<O, R>]
    ): AsyncIterable<O> {
        return pipe(source, ...stages);
    }
}
