
export type ProgressFunction = ({ total, count }: { total?: number; count?: number; }) => void;
export class Progress {
    // Expected total
    total = 1;   // so nothing gets divided by 0
    // Current value
    count = 0;    // yielded by the generator
    // Increment count. Also checks and clamps count to total
    increment(count: number = 1) {
        this.count += count;
        if (count > this.count) {
            this.count = count;
        }
    }
    // current progress as a percentage
    get progress() { return this.count / this.total * 100; }
    constructor(private prefix: string = "") { }
    reset() {
        this.total = 1;
        this.count = 0;
    }
    callback({ total, count }: { total?: number; count?: number; }) {
        this.total = total ?? this.total;
        this.count = count ?? this.count;
    }
    setTotal(source: Iterable<any> | Array<any>) { this.total = Array.from(source).length; return source; }
    setCount(source: Iterable<any> | Array<any>) { this.count = Array.from(source).length; return source; }
    toString() { return `${this.prefix ? this.prefix + ": " : ""}Progress ${this.count} / ${this.total} : ${this.progress.toFixed(2)}%` }
};
