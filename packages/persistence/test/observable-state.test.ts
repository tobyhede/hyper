import { describe, expect, it, vi } from 'vitest';
import { createNonThrowingReporter, createObservableState } from '../src/observable-state';

describe('createObservableState', () => {
  it('publishes the next state synchronously until a subscriber leaves', () => {
    const observable = createObservableState(0, () => undefined);
    const seen: number[] = [];
    const unsubscribe = observable.subscribe(() => seen.push(observable.getState()));
    observable.publish(1);
    expect(observable.getState()).toBe(1);
    expect(seen).toEqual([1]);
    unsubscribe();
    observable.publish(2);
    expect(seen).toEqual([1]);
  });

  it('notifies the subscribers present when publication began', () => {
    const observable = createObservableState(0, () => undefined);
    const seen: string[] = [];
    let subscribed = false;
    observable.subscribe(() => {
      seen.push('existing');
      if (subscribed) return;
      subscribed = true;
      observable.subscribe(() => seen.push('late'));
    });
    observable.publish(1);
    expect(seen).toEqual(['existing']);
    observable.publish(2);
    expect(seen).toEqual(['existing', 'existing', 'late']);
  });

  it('contains synchronous failures and asynchronous rejections and continues notifying', async () => {
    const reported: unknown[] = [];
    const observable = createObservableState(0, (error) => reported.push(error));
    const thrown = new Error('observer threw');
    const rejected = new Error('observer rejected');
    const seen: number[] = [];
    observable.subscribe(() => {
      throw thrown;
    });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    observable.subscribe(() => Promise.reject(rejected));
    observable.subscribe(() => seen.push(observable.getState()));
    expect(() => observable.publish(1)).not.toThrow();
    expect(seen).toEqual([1]);
    // Identity, not shape: `toEqual` compares an Error by name and message, so
    // this passed for a publisher that reported an Error it had manufactured
    // itself. What each failure carries is the point of forwarding it.
    await vi.waitFor(() => expect(reported).toHaveLength(2));
    expect(reported[0]).toBe(thrown);
    expect(reported[1]).toBe(rejected);
  });

  /**
   * A thenable is anything with a callable `then`, and Promises/A+ counts a
   * *function* carrying one. Nothing in this repo returns one today, so this
   * test is the whole of what holds `isThenable` open to them: narrowed back to
   * `typeof value === 'object'`, the rejection below escapes uncontained and
   * every other test in this file stays green.
   */
  it('contains a rejection from a callable thenable', async () => {
    const reported: unknown[] = [];
    const observable = createObservableState(0, (error) => reported.push(error));
    const rejected = new Error('callable thenable rejected');
    // Deferred rather than a held `Promise.reject`, so a narrowed guard fails
    // this test by reporting nothing instead of by killing the process.
    const callableThenable = Object.assign(() => undefined, {
      then: (_onFulfilled: unknown, onRejected: (reason: unknown) => unknown): void => {
        queueMicrotask(() => onRejected(rejected));
      },
    });
    const seen: number[] = [];
    observable.subscribe(() => callableThenable);
    observable.subscribe(() => seen.push(observable.getState()));

    expect(() => observable.publish(1)).not.toThrow();

    expect(seen).toEqual([1]);
    await vi.waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0]).toBe(rejected);
  });

  it('continues notifying when diagnostic reporting itself throws', () => {
    const observable = createObservableState(0, () => {
      throw new Error('reporter failed');
    });
    const seen: number[] = [];
    observable.subscribe(() => {
      throw new Error('observer failed');
    });
    observable.subscribe(() => seen.push(observable.getState()));
    expect(() => observable.publish(1)).not.toThrow();
    expect(seen).toEqual([1]);
  });

  /**
   * The other half of the non-throwing sink, and the half nothing above pins.
   *
   * A reporter that throws from the *synchronous* path is caught by the `try`
   * that called the observer, so an unwrapped sink still looks contained there.
   * The thenable path has no such `try` around it: a rejection handler that
   * throws rejects the promise it returns, nobody is holding that promise, and
   * Node answers an unhandled rejection by killing the process. So a copy that
   * wraps only the synchronous report keeps every other test in this file
   * green — which is exactly why this one exists.
   */
  it('contains a rejection whose own diagnostic reporting throws', async () => {
    const unhandled: unknown[] = [];
    const captureUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', captureUnhandled);
    try {
      const reported: unknown[] = [];
      const observable = createObservableState(0, (error) => {
        reported.push(error);
        throw new Error('reporter failed');
      });
      const rejected = new Error('observer rejected');
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      observable.subscribe(() => Promise.reject(rejected));

      observable.publish(1);

      await vi.waitFor(() => expect(reported).toEqual([rejected]));
      // One full turn of the event loop past the rejection: Node emits
      // `unhandledRejection` once the microtask queue has drained and the
      // promise still has no handler.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', captureUnhandled);
    }
  });

  it('can release every subscriber owned by a disposed collaborator', () => {
    const observable = createObservableState(0, () => undefined);
    const listener = vi.fn();
    observable.subscribe(listener);
    observable.clearSubscribers();
    observable.publish(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

/*
 * Exported beside `createObservableState` because SpaceAuthoring wraps its own
 * completion diagnostics with it, outside the observable-state seam — so it is
 * public surface with a caller of its own, not an implementation detail reached
 * only through publication.
 */
describe('createNonThrowingReporter', () => {
  it('forwards what it was handed to the wrapped reporter', () => {
    const reported: unknown[] = [];
    const report = createNonThrowingReporter((error) => reported.push(error));
    const error = new Error('observer failed');

    report(error);

    // Identity, not shape: forwarding the caller's own failure is the point.
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBe(error);
  });

  it('contains a reporter that throws', () => {
    const report = createNonThrowingReporter(() => {
      throw new Error('reporter failed');
    });

    expect(() => report(new Error('observer failed'))).not.toThrow();
  });
});
