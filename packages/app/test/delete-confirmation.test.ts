import { describe, expect, it, vi } from 'vitest';
import { createDeleteConfirmation, type DeleteQuestion } from '../src/delete-confirmation';

const NONE = { pending: null, deleting: false };

/** Space Authoring as the confirmation reads it: only its replacement epoch. */
function authoringStandIn() {
  let replacementEpoch = 0;
  const listeners = new Set<() => void>();
  return {
    getState: () => ({ replacementEpoch }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceStoredSpace: () => {
      replacementEpoch += 1;
      for (const listener of listeners) listener();
    },
  };
}

const question = (
  run: DeleteQuestion['run'],
  overrides: Partial<DeleteQuestion> = {},
): DeleteQuestion => ({
  subject: { kind: 'graph', name: 'Main' },
  from: 'Overview',
  description: 'Permanently deletes the Graph and all Edges from the Map.',
  run,
  focusFallback: null,
  ...overrides,
});

function open() {
  const authoring = authoringStandIn();
  const reported: unknown[] = [];
  const confirmation = createDeleteConfirmation({
    authoring,
    reportObserverError: (error) => reported.push(error),
  });
  return { authoring, reported, confirmation };
}

describe('asking', () => {
  it('stands the question a command arms without running its deletion', () => {
    const { confirmation } = open();
    const run = vi.fn();
    const asked = question(run);

    confirmation.arm(asked);

    expect(confirmation.getState()).toEqual({ pending: asked, deleting: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('replaces an unanswered question with a newer one', () => {
    const { confirmation } = open();
    const newer = question(vi.fn(), { subject: { kind: 'map', name: 'Detail' } });
    confirmation.arm(question(vi.fn()));

    confirmation.arm(newer);

    expect(confirmation.getState().pending).toBe(newer);
  });

  it('dismisses on Cancel without running the deletion', () => {
    const { confirmation } = open();
    const run = vi.fn();
    confirmation.arm(question(run));

    confirmation.cancel();

    expect(confirmation.getState()).toEqual(NONE);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('runs the deletion once and stands down when it settles', async () => {
    const { confirmation } = open();
    let settle: (() => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    confirmation.arm(question(run));

    confirmation.confirm();
    confirmation.confirm();
    confirmation.cancel();

    expect(run).toHaveBeenCalledTimes(1);
    expect(confirmation.getState().deleting).toBe(true);
    settle!();
    await vi.waitFor(() => expect(confirmation.getState()).toEqual(NONE));
  });

  it('reports a deletion that throws and stands down', async () => {
    const { confirmation, reported } = open();
    const failure = new Error('broke');
    confirmation.arm(
      question(() => {
        throw failure;
      }),
    );

    confirmation.confirm();

    await vi.waitFor(() => expect(confirmation.getState()).toEqual(NONE));
    expect(reported).toEqual([failure]);
  });
});

describe('replacement', () => {
  it('discards the question when the stored Space replaces the working one', () => {
    const { confirmation, authoring } = open();
    confirmation.arm(question(vi.fn()));

    authoring.replaceStoredSpace();

    expect(confirmation.getState()).toEqual(NONE);
  });

  it('keeps a late answer from closing a newer question', async () => {
    const { confirmation, authoring } = open();
    let settle: (() => void) | undefined;
    confirmation.arm(
      question(
        () =>
          new Promise<void>((resolve) => {
            settle = resolve;
          }),
      ),
    );
    confirmation.confirm();
    authoring.replaceStoredSpace();
    const newer = question(vi.fn());
    confirmation.arm(newer);

    settle!();
    await Promise.resolve();
    await Promise.resolve();

    expect(confirmation.getState()).toEqual({ pending: newer, deleting: false });
  });
});
