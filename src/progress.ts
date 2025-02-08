
export class Progress {
    total = 1;   // so nothing gets divided by 0
    count = 0;    // yielded by the generator
    get progress() { return this.count / this.total * 100; }
    toString() { return `Progress ${this.count} / ${this.total} : ${this.progress}%` }
};
