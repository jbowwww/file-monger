import { PipelineSourceLengthWrapped, makeAsyncGenerator, PipelineInput, PipelineSource, tap } from "./pipeline";
import { isAsyncGenerator, isBoolean, isFunction, isNumber, MaybeAsyncFunction } from "./models";

export const ProgressUpdate: unique symbol = Symbol("Progress update");
export type ProgressUpdate = { total: number; count: number; };
export type ProgressWrappedYield<T> = T & { [ProgressUpdate]: ProgressUpdate; }
export type ProgressWrappedYieldFn<T> = (value: T) => ProgressWrappedYield<T>;
export type ProgressWrapped<T> = AsyncGenerator<ProgressWrappedYield<T>>;
export type ProgressWrappedFn<T, S extends PipelineInput<T> = PipelineInput<T>/* , TI = S extends PipelineInput<infer TI> ? TI : never */> = (
    source: S,
    getTotal: number | MaybeAsyncFunction<[S/* PipelineSource<T> */], number>,
    shouldRetotal: MaybeAsyncFunction<ShouldRecountParameters<T, PipelineSource<T>/* PipelineInput<T> */>, boolean> | boolean
) => AsyncGenerator<ProgressWrappedYield<T>>;
export type ProgressTotalFn = (total: number | undefined) => void;
export type ProgressCountFn = (count: number) => void;
export type ProgressIncrementFn = (count?: number) => void;
export type ProgressResetFn = (total?: number | undefined, count?: number) => void;

export type AsyncProgressGenerator<O = any, R = any, N = any> = AsyncGenerator<ProgressWrappedYield<O>, R, N>;

export type ShouldRecountParameters<TI, S extends PipelineSource<TI>> = [S, Progress, number, number, number]; // source, msSinceRetotal, msIteration, iterationsSinceRecount

export class Progress<T = any> {
    #total: number | undefined = undefined;      // Expected total
    get total(): number | undefined {
        if (this.#pipeSource) {
            this.#total = isFunction(this.#pipeSource.length) ? this.#pipeSource.length() : this.#pipeSource.length;
        }
        if (this.#shared.length > 0) { 
            this.#total = this.#shared.reduce((r, p) => r += p.total ?? 0, 0);
        }
        return this.#total;
    }
    #count: number = 0;                          // Current count
    get count(): number | undefined {
        if (this.#shared.length > 0) { 
            this.#count = this.#shared.reduce((r, p) => r += p.count ?? 0, 0);
        }
        return this.#count;
    }

    // current progress as a percentage IFF this.total is not zero (default is zero) : otherwise, returns ths.count
    get progress() { return this.#total && this.#total !== 0 ? this.#count / this.#total * 100 : this.#count; }

    constructor(private prefix: string = "") { }

    #pipeSource: PipelineSourceLengthWrapped<T, any, any> | undefined = undefined;

    #shared: Progress[] = [];
    shared(): Progress {
        const progress = new Progress(this.prefix + "#shared#" + this.#shared.length + 1);
        this.#shared.push(progress);
        return progress;
    }

    setTotal = (total: number | undefined) => { this.#total = total; }
    // setTotal<S extends PipelineInput<T>>(source: S, getTotal: (source: S) => number): S;
    setTotalFromSource<S extends PipelineInput<T>>(source: S, getTotal: (source: S) => number): S {
        this.#total = getTotal(source);
        return source;
    }
    setCount = (count: number) => { this.#count = count; }
    setCountFromSource = <S extends PipelineInput<T>>(source: S, getCount: (source: S) => number, getSource?: (source: S) => PipelineInput<T>) => {
        this.#count = getCount(source);
        return getSource ? getSource(source) : source;
    }
    // might not need to declare thes efn's this way if the wrapYield approach works out - TBD
    incrementTotal = (total: number = 1) => { this.#total = (this.#total ?? 0) + total; }
    incrementCount = (count: number = 1) => { this.#count += count; }

    pipeCounter = tap(_ => this.incrementCount());
    
    reset(totalOrPipeSource: number | PipelineSourceLengthWrapped<T> | undefined = undefined, count: number = 0) {
        if (isAsyncGenerator<T>(totalOrPipeSource) || totalOrPipeSource === undefined) {
            this.#pipeSource = totalOrPipeSource;
        } else {
            if (totalOrPipeSource) { this.#total = totalOrPipeSource as number; }
            if (count) { this.#count = count; }
        }
    }

    get connect() {
        const _this = this;
        return ({
            get read(): Partial<Progress> { return ({ total: _this.#total, count: _this.#count, }); },
            get readWrite(): Partial<Progress> { return ({ ...this.read, setTotal: _this.setTotal, setCount: _this.setCount, reset: _this.reset, incrementTotal: _this.incrementTotal, wrapYield: _this.wrapYield, wrap: _this.wrap, }); },
            get readWriteTotal(): Partial<Progress> { return ({ ...this.read, setTotal: _this.setTotal, reset: _this.reset, wrapYield: _this.wrapYield, wrap: _this.wrap, }); },
            get readWriteCount(): Partial<Progress> { return ({ ...this.read, setCount: _this.setCount, incrementCount: _this.incrementCount, }); },
        });
    }
    
    async* wrap<S extends PipelineInput<T> = PipelineInput<T>/* , TI = S extends PipelineInput<infer TI> ? TI : never */>(
        source: S,
        getTotal: number | MaybeAsyncFunction<[S/* PipelineSource<T> */], number>,
        shouldRetotal: MaybeAsyncFunction<ShouldRecountParameters<T, PipelineSource<T>/* PipelineInput<T> */>, boolean> | boolean = false
    ): AsyncGenerator<ProgressWrappedYield<T>> {
        let retotalMark!: number;
        let iterationMark!: number;
        let iterationsSinceRetotal: number = 0;
        let innerSource: PipelineSource<T> = makeAsyncGenerator(source);//= isPlainFunction(source) ? source() as S : source;
        const retotal = async () => {
            this.#total = await (getTotal as MaybeAsyncFunction<[PipelineSource<T>], number>)(innerSource);
            retotalMark = Date.now();
            iterationsSinceRetotal = 0;
        }
        const dt = (mark: number, current: number = Date.now()) => current - mark;
        if (isNumber(getTotal)) {
            this.#total = getTotal;
            shouldRetotal = false;
        } else {
            await retotal();
            iterationMark = retotalMark;
        }
        for await (const item of innerSource) {
            yield this.wrapYield(item);
            this.incrementCount();
            if (!isNumber(getTotal) && ((isBoolean(shouldRetotal) && shouldRetotal) ||
                (isFunction(shouldRetotal) && shouldRetotal(innerSource, this, dt(retotalMark), dt(iterationMark), ++iterationsSinceRetotal)))
            ) {
                retotal();
            }
        }
    }

    wrapYield = (value: T) => {
        return Object.defineProperty(value, ProgressUpdate, { value: this, }) as ProgressWrappedYield<T>;
    }

    toString() { return `${this.prefix ? this.prefix + ": " : ""}Progress ${this.#count} / ${this.#total} : ${this.progress.toFixed(2)}%`; }
};
