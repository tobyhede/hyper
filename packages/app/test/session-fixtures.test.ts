import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import { waitForSettled } from './session-fixtures';

const snapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
  document: { version: 2, title: 'Space', routes: [] },
  cards: [],
};

const withPersistence = (persistence: SpaceSessionState['persistence']): SpaceSessionState => ({
  working: snapshot,
  acknowledgedRevision: 0n,
  changedSinceExport: false,
  persistence,
});

describe('waitForSettled', () => {
  it('rejects an already-failed persistence state without subscribing', async () => {
    const failed = withPersistence({
      kind: 'failed',
      failure: { kind: 'retryable-failure', code: 'unavailable', message: 'Try later' },
    });

    await expect(
      waitForSettled(
        () => failed,
        () => {
          throw new Error('A terminal state must not subscribe');
        },
      ),
    ).rejects.toThrow('Persistence ended as failed');
  });

  it('rejects when pending persistence becomes rejected', async () => {
    let current = withPersistence({ kind: 'pending' });
    let notify: (() => void) | undefined;
    const result = waitForSettled(
      () => current,
      (listener) => {
        notify = listener;
        return () => {
          notify = undefined;
        };
      },
    );

    current = withPersistence({
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'invalid-snapshot', message: 'Invalid' },
    });
    notify?.();

    await expect(result).rejects.toThrow('Persistence ended as rejected');
    expect(notify).toBeUndefined();
  }, 250);
});
