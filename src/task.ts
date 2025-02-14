import { Progress } from "./progress";

export type TaskFn<TArgs extends any[] = [], TResult = void> = (task: Task<TArgs, TResult>, ...args: TArgs) => Promise<TResult>;

export type TaskOptions = Partial<{
    progress?: Progress;
}>;
export const TaskOptions: {
    default: TaskOptions;
} = {
    get default() { return ({
        progress: new Progress(),
    }); },
}

export type TaskStartOptions = Partial<{
    preDelay: number;
    postDelay: number;    
}>;
export const TaskStartOptions: {
    default: TaskStartOptions;
} = {
    default: {
        preDelay: 0,
        postDelay: 0,
    },
};

export class Task<TArgs extends any[] = [], TResult = void> {
    
    static #taskAnonIdNum = 0;

    #taskPr: Promise<TResult> | null = null;
    #result: TResult | null = null;
    
    public readonly name: string;
    public readonly progress;
    public get hasResult() { return this.#taskPr !== null && this.#result !== null; }
    public get result() { return this.#taskPr; }
    public get complete() { return this.progress.total > 0 && this.progress.count === this.progress.total; }
    public get hasStarted() { return this.#taskPr !== null; }
    public get hasFinished() { return this.#result !== null; }

    constructor(public readonly taskFn: TaskFn<TArgs, TResult>, public readonly taskOptions: TaskOptions = TaskOptions.default) {
        this.name = taskFn.name ?? `Task #${++Task.#taskAnonIdNum}`;
        this.progress = new Progress(this.name);
    }

    public start(...args: TArgs) {
        this.progress?.reset();
        return this.#taskPr = this.taskFn(this, ...args).then(result => this.#result = result ?? {} as TResult);
    }

    // public newSubTask<TSubArgs extends any[], TSubReturn extends any>(taskFn: Task<TSubArgs, TSubResult>, taskOptions: TaskOptions = TaskOptions.default) {
    //     options = { ...TaskOptions.default, { progress: }}
    // }

    public static start<TArgs extends any[], TReturn extends any>(taskFns: TaskFn<TArgs, TReturn>[], taskArgs?: TArgs[]) {
        if (taskArgs?.length !== taskFns.length) {
            throw new RangeError(`taskArgs should be same length as taskFns array: taskFns.length=${taskFns.length} taskArgs.length=${taskArgs?.length ?? "(null)"})`);
        }
        return Promise.all(taskFns.map((taskFn, i) => new Task(taskFn).start(...taskArgs[i])));
    }

    public static async delay(ms: number) {
        return await new Promise((resolve, reject) => setTimeout(resolve, ms));
    }

    public static async repeat<TArgs extends any[], TReturn extends any>(options: TaskStartOptions, taskFn: TaskFn<TArgs, TReturn>, ...args: TArgs) {
        options = { ...TaskOptions.default, ...options };
        while (true) {
            if (options.preDelay && options.preDelay > 0) {
                await Task.delay(options.preDelay);
            }
            await new Task<TArgs, TReturn>(taskFn).start(...args);
            if (options.postDelay && options.postDelay > 0) {
                await Task.delay(options.postDelay);
            };
        }
    }

    public async repeat( args: TArgs, options?: TaskStartOptions) {
        options = { ...TaskOptions.default, ...options };
        while (true) {
            if (options.preDelay && options.preDelay > 0) {
                await Task.delay(options.preDelay);
            }
            await this.start(...args);
            if (options.postDelay && options.postDelay > 0) {
                await Task.delay(options.postDelay);
            };
        }
    }
}