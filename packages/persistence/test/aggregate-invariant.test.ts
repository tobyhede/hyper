import { describe, expect, it } from 'vitest';
import { AggregateInvariantError, isAggregateInvariant } from '../src/repository';

describe('isAggregateInvariant', () => {
  it('recognises the error itself', () => {
    expect(isAggregateInvariant(new AggregateInvariantError('broken'))).toBe(true);
  });

  it('refuses an unrelated failure, which is what a reachability problem is', () => {
    expect(isAggregateInvariant(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(false);
  });

  it('refuses a value that is not an error at all', () => {
    expect(isAggregateInvariant(undefined)).toBe(false);
    expect(isAggregateInvariant('Stored Spaces exist without a Meta Space')).toBe(false);
  });

  // The driver does not always rethrow what the transaction callback threw. When
  // the rollback after a callback error itself fails, `@prisma-next/sql-runtime`
  // destroys the connection and throws `RUNTIME.TRANSACTION_ROLLBACK_FAILED`
  // with the original on `.cause`. A bare `instanceof` on the top-level error
  // reads that as an unreachable database and retries what no retry cures.
  it('walks the cause chain the driver wraps a rollback failure in', () => {
    const wrapped = new Error('Transaction rollback failed after callback error');
    wrapped.cause = new AggregateInvariantError('Stored Spaces exist without a Meta Space');

    expect(isAggregateInvariant(wrapped)).toBe(true);
  });

  it('walks a chain deeper than one link', () => {
    const inner = new Error('outer');
    inner.cause = new AggregateInvariantError('broken');
    const outer = new Error('outermost');
    outer.cause = inner;

    expect(isAggregateInvariant(outer)).toBe(true);
  });

  // A cause chain is data from a driver, and a driver that builds a cycle would
  // otherwise hang the reader that classifies its error.
  it('terminates on a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second');
    first.cause = second;
    second.cause = first;

    expect(isAggregateInvariant(first)).toBe(false);
  });
});
