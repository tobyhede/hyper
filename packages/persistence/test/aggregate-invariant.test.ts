import { describe, expect, it } from 'vitest';
import {
  AggregateInvariantError,
  classifyStoredFailure,
  isAggregateInvariant,
  PersistenceUnavailableError,
} from '../src/repository';

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

// Ticket 31. The two named failures a stored-seam reader tells apart, and the
// third it meets that neither describes. Neither named arm is the other's
// else-branch: a failure that is neither broken stored state nor an
// unreachable database is classified as neither, and each reader decides its
// own answer for it rather than inheriting one by default.
describe('classifyStoredFailure', () => {
  it('names broken stored state', () => {
    expect(classifyStoredFailure(new AggregateInvariantError('broken'))).toBe(
      'broken-stored-state',
    );
  });

  it('names an unreachable database', () => {
    expect(classifyStoredFailure(new PersistenceUnavailableError('refused'))).toBe('unavailable');
  });

  it('names neither for a failure that is neither', () => {
    expect(classifyStoredFailure(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(
      'unclassified',
    );
    expect(classifyStoredFailure(new TypeError('undefined is not a function'))).toBe(
      'unclassified',
    );
    expect(classifyStoredFailure(undefined)).toBe('unclassified');
  });

  // The driver wraps a failed COMMIT or a failed rollback and carries the
  // original only on `.cause`, whichever of the two named failures it was.
  it('walks the cause chain for either named failure', () => {
    expect(
      classifyStoredFailure(
        new Error('Transaction commit failed', {
          cause: new PersistenceUnavailableError('refused'),
        }),
      ),
    ).toBe('unavailable');
    expect(
      classifyStoredFailure(
        new Error('Transaction rollback failed after callback error', {
          cause: new AggregateInvariantError('broken'),
        }),
      ),
    ).toBe('broken-stored-state');
  });

  // Broken stored state is the stronger claim: a rollback that failed because
  // the connection went away after the callback found broken state still
  // found it.
  it('prefers broken stored state when a chain carries both', () => {
    expect(
      classifyStoredFailure(
        new PersistenceUnavailableError('refused', {
          cause: new AggregateInvariantError('broken'),
        }),
      ),
    ).toBe('broken-stored-state');
  });

  it('terminates on a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second');
    first.cause = second;
    second.cause = first;

    expect(classifyStoredFailure(first)).toBe('unclassified');
  });
});
