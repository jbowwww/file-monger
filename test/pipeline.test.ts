import { batch, merge, interval } from '../src/pipeline';
import { Task } from '../src/task'; // Assuming Task.delay is available or use setTimeout

describe('batch function', () => {
  it('should emit all items including leftovers in final batch', async () => {
    // Source yields 5 items slowly
    const source = async function* () {
      for (let i = 1; i <= 5; i++) {
        yield i;
        await Task.delay(10); // Small Task.delay to simulate async
      }
    };

    const batches = [];
    // Use batch with maxSize=3, should get [1,2,3] and [4,5]
    for await (const b of batch({ maxSize: 3, timeoutMs: 100 }, source())) {
      batches.push(b);
    }

    // Expect two batches: full [1,2,3] and partial [4,5]
    expect(batches).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('should handle empty source', async () => {
    const source = async function* () {}; // Empty
    const batches = [];
    for await (const b of batch({ maxSize: 3, timeoutMs: 100 }, source())) {
      batches.push(b);
    }
    expect(batches).toEqual([]);
  });

  it('should emit on timeout even with partial batch', async () => {
    const source = async function* () {
      yield 1; // Only one item, then timeout should trigger
      await Task.delay(150); // Longer than timeoutMs
    };

    const batches = [];
    for await (const b of batch({ maxSize: 3, timeoutMs: 100 }, source())) {
      batches.push(b);
    }

    // Should emit [1] due to timeout
    expect(batches).toEqual([[1]]);
  });
});

describe('merge function', () => {
  it('should merge multiple async iterables correctly', async () => {
    const source1 = async function* () {
      yield 1; await Task.delay(50); yield 2;
    };
    const source2 = async function* () {
      yield 'a'; await Task.delay(30); yield 'b';
    };

    const result = [];
    for await (const item of merge<number | string>([source1(), source2()])) {
      result.push(item);
    }

    // Order may vary, but should contain all items
    expect(result.sort()).toEqual([1, 2, 'a', 'b'].sort());
  });

  it('should handle empty iterables', async () => {
    const source1 = async function* () {};
    const source2 = async function* () { yield 'only'; };

    const result = [];
    for await (const item of merge([source1(), source2()])) {
      result.push(item);
    }

    expect(result).toEqual(['only']);
  });

  it('should complete when all sources are done', async () => {
    const source1 = async function* () { yield 1; };
    const source2 = async function* () { yield 2; };

    let count = 0;
    for await (const _ of merge([source1(), source2()])) {
      count++;
    }

    expect(count).toBe(2); // Both items yielded
  });
});
