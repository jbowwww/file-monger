import { Progress } from "./progress";

export type TaskFn<TArgs extends any[] = [], TResult = void> = (task: Task<TArgs, TResult>, ...args: TArgs) => Promise<TResult>;

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

    constructor(public readonly taskFn: TaskFn<TArgs, TResult>) {
        this.name = taskFn.name ?? `Task #${++Task.#taskAnonIdNum}`;
        this.progress = new Progress(this.name);
    }

    public start(...args: TArgs) {
        return this.#taskPr = this.taskFn(this, ...args).then(result => this.#result = result ?? {} as TResult);
    }
    public static start(...taskFns: TaskFn<[], void>[]) {
        return Promise.all(taskFns.map(taskFn => new Task(taskFn).start()));
    }

    public static async delay(ms: number) {
        return await new Promise((resolve, reject) => setTimeout(resolve, ms));
    }

    public static async repeat(taskFn: TaskFn<[], void>) {
        while (true) {
            await new Task(taskFn).start();
        }
    }
}