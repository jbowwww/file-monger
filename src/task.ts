import { report } from "process";
import { Progress } from "./progress";

export type TaskFn<TArgs extends any[] = [], TResult = void> = (task: Task<TArgs, TResult>, ...args: TArgs) => Promise<TResult>;

export class Task<TArgs extends any[] = [], TResult = void> {
    #taskPr: Promise<TResult> | null = null;
    #result: TResult | null = null
    public readonly progress = new Progress();
    public get hasResult() { return this.#taskPr !== null && this.#result !== null; }
    public get result() { return this.#taskPr; }
    public get complete() { return this.progress.total > 0 && this.progress.count === this.progress.total; }
    public get hasStarted() { return this.#taskPr !== null; }
    public get hasFinished() { return this.#result !== null; }
    constructor(public readonly taskFn: TaskFn<TArgs, TResult>) {

    }
    public start(...args: TArgs) {
        this.#taskPr = this.taskFn(this, ...args).then(result => this.#result = result);
        return this;
    }
    public static start(...taskFns: TaskFn<[], void>[]) {
        return taskFns.map(taskFn => new Task(taskFn).start());
    }
}