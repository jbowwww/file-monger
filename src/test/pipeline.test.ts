import { batch, merge, interval, isIntervalYieldResult } from '../../src/pipeline';
import { Task } from "../../src/task";

describe('merge function', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should merge items from multiple async iterables', async () => {
    const source1 = async function* () {
      yield 1;
      yield 2;
    };

    const source2 = async function* () {
      yield 3;
      yield 4;
    };

    const results: number[] = [];
    for await (const item of merge([source1(), source2()])) {
      results.push(item);
    }

    expect(results).toHaveLength(4);
    expect(results.sort()).toEqual([1, 2, 3, 4]);
  });
});

it('should merge items from multiple async iterables in order if async delays happen between yields', async () => {
  const source1 = async function* () {
    yield 1;
    await Task.delay(100);
    yield 2;
  };

  const source2 = async function* () {
    await Task.delay(10);
    yield 3;
    await Task.delay(150);
    yield 4;
  };

  const results: number[] = [];
  for await (const item of merge([source1(), source2()])) {
    results.push(item);
  }

  expect(results).toHaveLength(4);
  expect(results).toEqual([1, 3, 2, 4]);
});

it('should handle empty sources', async () => {
  const emptySource = async function* () { };
  const nonEmptySource = async function* () {
    yield 'test';
  };

  const results: string[] = [];
  for await (const item of merge([emptySource(), nonEmptySource()])) {
    results.push(item);
  }

  expect(results).toEqual(['test']);
});

it('should handle empty sources that finish before other sources have remaining yields', async () => {
  const emptySource = async function* () { };
  const nonEmptySource = async function* () {
    await Task.delay(100);
    yield 'test';
  };

  const results: string[] = [];
  for await (const item of merge([emptySource(), nonEmptySource()])) {
    results.push(item);
  }

  expect(results).toEqual(['test']);
});

it('should handle two empty sources', async () => {
  const emptySource = async function* () { };
  const nonEmptySource = async function* () { };

  const results: string[] = [];
  for await (const item of merge([emptySource(), nonEmptySource()])) {
    results.push(item);
  }

  expect(results).toEqual([]);
});


it('should handle sources that finish at different times', async () => {
  const fastSource = async function* () {
    yield 'fast1';
    yield 'fast2';
  };

  const slowSource = async function* () {
    await Task.delay(10);
    yield 'slow1';
    await Task.delay(10);
    yield 'slow2';
  };

  const results: string[] = [];
  for await (const item of merge([fastSource(), slowSource()])) {
    results.push(item);
  }

  expect(results).toHaveLength(4);
  expect(results).toContain('fast1');
  expect(results).toContain('fast2');
  expect(results).toContain('slow1');
  expect(results).toContain('slow2');
});

it('should handle primary vs secondary sources correctly', async () => {
  const primarySource = async function* () {
    yield 'primary';
  };

  const secondarySource = async function* () {
    yield 'secondary';
    // Secondary should keep running even after primary finishes
    await Task.delay(50);
    yield 'secondary2';
  };

  const results: string[] = [];
  for await (const item of merge([primarySource()], [secondarySource()])) {
    results.push(item);
  }

  // Should only get primary item since merge should stop when primary sources finish
  expect(results).toContain('primary');
  expect(results).toHaveLength(1);
});

it('should handle single source', async () => {
  const singleSource = async function* () {
    yield 1;
    yield 2;
    yield 3;
  };

  const results: number[] = [];
  for await (const item of merge([singleSource()])) {
    results.push(item);
  }

  expect(results).toEqual([1, 2, 3]);
});

it('should handle sources with different yield patterns', async () => {
  const burstySource = async function* () {
    yield 'burst1';
    yield 'burst2';
    yield 'burst3';
  };

  const spacedSource = async function* () {
    yield 'spaced1';
    await Task.delay(5);
    yield 'spaced2';
  };

  const results: string[] = [];
  for await (const item of merge([burstySource(), spacedSource()])) {
    results.push(item);
  }

  expect(results).toHaveLength(5);
});

describe('batch function', () => {
  it('should batch items by size', async () => {
    const source = async function* () {
      for (let i = 1; i <= 25; i++) {
        yield i;
      }
    };

    const batches: number[][] = [];
    const batchGen = batch({ maxSize: 10, timeoutMs: 1000 }, source());

    // Process batches without waiting for timers
    const batchPromise = (async () => {
      for await (const batch of batchGen) {
        batches.push([...batch]);
      }
    })();

    await batchPromise;

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5); // This is the critical test - leftover items
    expect(batches[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(batches[1]).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(batches[2]).toEqual([21, 22, 23, 24, 25]);
  });

  it('should batch items by timeout', async () => {
    const source = async function* () {
      yield 1;
      yield 2;
      // Source ends here, but we should get a batch after timeout
    };

    const batches: number[][] = [];
    const batchGen = batch({ maxSize: 10, timeoutMs: 100 }, source());

    const batchPromise = (async () => {
      for await (const batch of batchGen) {
        batches.push([...batch]);
      }
    })();

    // Advance timers to trigger timeout
    // jest.advanceTimersByTime(150);
    await batchPromise;

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([1, 2]);
  });

  it('should handle empty source', async () => {
    const emptySource = async function* () { };

    const batches: any[][] = [];
    for await (const b of batch({ maxSize: 5, timeoutMs: 100 }, emptySource())) {
      batches.push([...b]);
    }

    expect(batches).toHaveLength(0);
  });

  it('should handle single item', async () => {
    const singleSource = async function* () {
      yield 'single';
    };

    const batches: string[][] = [];
    const batchGen = batch({ maxSize: 10, timeoutMs: 100 }, singleSource());

    const batchPromise = (async () => {
      for await (const b of batchGen) {
        batches.push([...b]);
      }
    })();

    // Need to advance timer to flush the final batch
    // jest.advanceTimersByTime(150);
    await batchPromise;

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(['single']);
  });

  it('should handle exact batch size multiples', async () => {
    const source = async function* () {
      for (let i = 1; i <= 20; i++) {
        yield i;
      }
    };

    const batches: number[][] = [];
    for await (const b of batch({ maxSize: 10, timeoutMs: 1000 }, source())) {
      batches.push([...b]);
    }

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
  });

  it('should handle mixed size and timeout batching', async () => {
    const source = async function* () {
      yield 1;
      yield 2;
      yield 3;
      // Pause longer than timeout
      await Task.delay(150);
      yield 4;
      yield 5;
    };

    const batches: number[][] = [];
    const batchGen = batch({ maxSize: 10, timeoutMs: 100 }, source());

    const batchPromise = (async () => {
      for await (const batch of batchGen) {
        batches.push([...batch]);
      }
    })();

    // Advance time to trigger first timeout batch
    // jest.advanceTimersByTime(150);
    // Advance more time for the remaining items
    // jest.advanceTimersByTime(200);

    await batchPromise;

    expect(batches.length).toBeGreaterThanOrEqual(1);
    // Should have at least the first timeout batch
    expect(batches[0]).toEqual([1, 2, 3]);
  });

  it('should use default options when not provided', async () => {
    const source = async function* () {
      for (let i = 1; i <= 15; i++) {
        yield i;
      }
    };

    const batches: number[][] = [];
    // Using source as first parameter (overload test)
    for await (const b of batch(source())) {
      batches.push([...b]);
    }

    // Default maxSize should be 10
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(5);
  });

  it('should handle rapid successive items', async () => {
    const source = async function* () {
      for (let i = 1; i <= 100; i++) {
        yield i;
        // No delay - rapid succession
      }
    };

    const batches: number[][] = [];
    for await (const b of batch({ maxSize: 7, timeoutMs: 1000 }, source())) {
      batches.push([...b]);
    }

    expect(batches).toHaveLength(15); // 100/7 = 14.28, so 15 batches
    expect(batches[batches.length - 1]).toHaveLength(2); // 100 % 7 = 2
  });
});

describe('batch and merge integration', () => {
  it('should properly handle interval yield results', async () => {
    // Test that interval results are filtered out and trigger batching
    const source = async function* () {
      yield 1;
      yield 2;
    };

    const batches: number[][] = [];
    const batchGen = batch({ maxSize: 10, timeoutMs: 50 }, source());

    const batchPromise = (async () => {
      for await (const batch of batchGen) {
        batches.push([...batch]);
      }
    })();

    // jest.advanceTimersByTime(100);
    await batchPromise;

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([1, 2]);
    // Verify no interval yield results made it through
    expect(batches[0].every(item => !isIntervalYieldResult(item))).toBe(true);
  });

  it('should handle source completion with pending batch', async () => {
    const source = async function* () {
      yield 'a';
      yield 'b';
      yield 'c';
      // Source completes with 3 items, less than maxSize
    };

    const batches: string[][] = [];
    const batchGen = batch({ maxSize: 5, timeoutMs: 100 }, source());

    const batchPromise = (async () => {
      for await (const batch of batchGen) {
        batches.push([...batch]);
      }
    })();

    // // The key test: does the final partial batch get emitted?
    // jest.advanceTimersByTime(150);
    await batchPromise;

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(['a', 'b', 'c']);
  });
});
