
export class Progress {
    total = 1;   // so nothing gets divided by 0
    count = 0;    // yielded by the generator
    get progress() { return this.count / this.total * 100; }
    constructor(private prefix: string = "") { }
    toString() { return `${this.prefix ? this.prefix + ": " : ""}Progress ${this.count} / ${this.total} : ${this.progress.toFixed(2)}%` }
};
