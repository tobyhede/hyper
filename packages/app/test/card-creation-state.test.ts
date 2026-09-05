import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  createCardCreation,
  type CardCreationChoices,
  type CardCreationOutcome,
  type CardCreationRead,
  type CardCreationSeams,
} from '../src/card-creation';

const CARD_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const aliasChoices: CardCreationChoices = { kind: 'alias', targets: [] };
const spaceChoices: CardCreationChoices = { kind: 'space', targets: { kind: 'read', spaces: [] } };
const spaceInput = { kind: 'space', targetSpaceId: null, title: 'Recap' } as const;
const aliasInput = { kind: 'alias', target: CARD_ID, title: '' } as const;
const UNREADABLE: CardCreationRead = {
  choices: { kind: 'space', targets: { kind: 'unreadable' } },
  listing: { fields: {}, form: 'The stored Spaces could not be read.' },
};

const creationWith = (seams: Partial<CardCreationSeams> = {}) =>
  createCardCreation({
    readChoices: (kind) => ({
      choices: kind === 'alias' ? aliasChoices : spaceChoices,
      listing: null,
    }),
    submit: () => ({ kind: 'none' }),
    reportBreak: () => undefined,
    ...seams,
  });

const RETURN_TO_ADD_CARD = {
  kind: 'cancelled',
};

describe('the Card creation pane', () => {
  it('installs admission before notifying an observer that opens another kind', () => {
    const readChoices = vi.fn((): CardCreationRead => ({ choices: aliasChoices, listing: null }));
    const creation = creationWith({ readChoices });
    const unsubscribe = creation.subscribe(() => creation.open('space'));
    creation.open('alias');
    unsubscribe();
    expect(readChoices).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane).toMatchObject({ choices: aliasChoices });
  });

  it('admits only the first open before the caller reads state again', () => {
    const readChoices = vi.fn((kind: 'alias' | 'space'): CardCreationRead => ({
      choices: kind === 'alias' ? aliasChoices : spaceChoices,
      listing: null,
    }));
    const creation = creationWith({ readChoices });
    creation.open('alias');
    creation.open('space');

    expect(readChoices).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: aliasChoices,
      listing: null,
      refusal: null,
    });
  });

  it('opens the Space Card pane while its list is pending', () => {
    const creation = creationWith({ readChoices: () => new Promise<never>(() => undefined) });
    creation.open('space');
    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: { kind: 'space', targets: { kind: 'pending' } },
      listing: null,
      refusal: null,
    });
  });

  it('ignores an old read after cancellation and reopening', async () => {
    const first = Promise.withResolvers<CardCreationRead>();
    const second = Promise.withResolvers<CardCreationRead>();
    const readChoices = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const creation = creationWith({ readChoices });
    creation.open('space');
    creation.cancel();
    creation.open('space');
    first.resolve(UNREADABLE);
    await first.promise;
    expect(creation.getState().pane).toMatchObject({
      choices: { kind: 'space', targets: { kind: 'pending' } },
      listing: null,
    });
    second.resolve({ choices: spaceChoices, listing: null });
    await second.promise;
    expect(creation.getState().pane).toMatchObject({ choices: spaceChoices, listing: null });
  });

  it('ignores a choices read after the pane has closed', async () => {
    const read = Promise.withResolvers<CardCreationRead>();
    const creation = creationWith({ readChoices: () => read.promise });
    creation.open('space');
    creation.cancel();
    read.resolve({ choices: spaceChoices, listing: null });
    await read.promise;
    expect(creation.getState().pane.status).toBe('closed');
  });
});

describe('a creation attempt', () => {
  it('admits the attempt before its collaborator can reenter', () => {
    const submit = vi.fn((): CardCreationOutcome => {
      if (submit.mock.calls.length === 1) {
        creation.submit(aliasInput);
        creation.cancel();
      }
      return { kind: 'created', cardId: CARD_ID };
    });
    const creation = creationWith({ submit });
    creation.open('alias');
    creation.submit(aliasInput);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(creation.getState().continuation).toEqual({
      kind: 'created',
      cardKind: 'alias',
      cardId: CARD_ID,
    });
  });

  it('starts no attempt when closed', () => {
    const submit = vi.fn((): CardCreationOutcome => ({ kind: 'none' }));
    const creation = creationWith({ submit });
    creation.submit(spaceInput);
    expect(submit).not.toHaveBeenCalled();
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits one asynchronous attempt and blocks dismissal until it settles', async () => {
    const attempt = Promise.withResolvers<CardCreationOutcome>();
    const submit = vi.fn(() => attempt.promise);
    const creation = creationWith({ submit });
    creation.open('space');
    creation.submit(spaceInput);
    creation.submit(spaceInput);
    creation.cancel();
    creation.withdraw();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane.status).toBe('submitting');
    expect(creation.getState().continuation).toBeNull();

    attempt.resolve({ kind: 'refused', errors: { fields: { title: 'Required.' } } });
    await attempt.promise;
    expect(creation.getState().pane).toMatchObject({
      status: 'choosing',
      refusal: { fields: { title: 'Required.' } },
    });
    creation.cancel();
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits a retry immediately after a synchronous refusal', () => {
    const submit = vi
      .fn<CardCreationSeams['submit']>()
      .mockReturnValueOnce({ kind: 'refused', errors: { fields: { title: 'Required.' } } })
      .mockReturnValueOnce({ kind: 'created', cardId: CARD_ID });
    const creation = creationWith({ submit });
    creation.open('alias');
    creation.submit(aliasInput);
    expect(creation.getState().pane).toMatchObject({
      status: 'choosing',
      refusal: { fields: { title: 'Required.' } },
    });
    creation.submit(aliasInput);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits no second attempt after synchronous creation', () => {
    const submit = vi.fn((): CardCreationOutcome => ({ kind: 'created', cardId: CARD_ID }));
    const creation = creationWith({ submit });
    creation.open('alias');
    creation.submit(aliasInput);
    creation.submit(aliasInput);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('never publishes busy controls for synchronous creation', () => {
    const creation = creationWith({ submit: () => ({ kind: 'created', cardId: CARD_ID }) });
    creation.open('alias');
    const statuses: string[] = [];
    creation.subscribe(() => statuses.push(creation.getState().pane.status));
    creation.submit(aliasInput);
    expect(statuses).toEqual(['closed']);
  });

  it('keeps the pane open and withdraws the previous refusal when an attempt does nothing', () => {
    const submit = vi
      .fn<CardCreationSeams['submit']>()
      .mockReturnValueOnce({ kind: 'refused', errors: { fields: { title: 'Required.' } } })
      .mockReturnValueOnce({ kind: 'none' });
    const creation = creationWith({ submit });
    creation.open('alias');
    creation.submit(aliasInput);
    creation.submit(aliasInput);
    expect(creation.getState().pane).toMatchObject({ status: 'choosing', refusal: null });
    expect(creation.getState().continuation).toBeNull();
  });
});

describe('a failed list and a refused attempt', () => {
  it('typing withdraws the attempt refusal but preserves the failed listing', () => {
    const creation = creationWith({
      readChoices: () => UNREADABLE,
      submit: () => ({ kind: 'refused', errors: { fields: { title: 'Required.' } } }),
    });
    creation.open('space');
    creation.submit(spaceInput);
    creation.refusalStale();
    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: UNREADABLE.choices,
      listing: UNREADABLE.listing,
      refusal: null,
    });
  });

  it('keeps a failed listing visible while an attempt is running', async () => {
    const read = Promise.withResolvers<CardCreationRead>();
    const creation = creationWith({
      readChoices: () => read.promise,
      submit: () => new Promise<never>(() => undefined),
    });
    creation.open('space');
    creation.submit(spaceInput);
    read.resolve(UNREADABLE);
    await read.promise;
    creation.refusalStale();
    expect(creation.getState().pane).toEqual({
      status: 'submitting',
      choices: UNREADABLE.choices,
      listing: UNREADABLE.listing,
    });
  });
});

describe('where creation continues', () => {
  it('returns to Add Card after cancellation and consumes the continuation once', () => {
    const creation = creationWith();
    creation.open('space');
    creation.cancel();
    expect(creation.getState().continuation).toEqual(RETURN_TO_ADD_CARD);
    creation.continued();
    expect(creation.getState().continuation).toBeNull();
    const changed = vi.fn();
    creation.subscribe(changed);
    creation.continued();
    expect(changed).not.toHaveBeenCalled();
  });

  it('hands the created Alias to continuation', () => {
    const creation = creationWith({ submit: () => ({ kind: 'created', cardId: CARD_ID }) });
    creation.open('alias');
    creation.submit(aliasInput);
    expect(creation.getState().continuation).toEqual({
      kind: 'created',
      cardKind: 'alias',
      cardId: CARD_ID,
    });
  });

  it('hands completed Space Card creation to continuation', async () => {
    const creation = creationWith({
      submit: () => Promise.resolve({ kind: 'created', cardId: null }),
    });
    creation.open('space');
    creation.submit(spaceInput);
    await Promise.resolve();
    expect(creation.getState().pane.status).toBe('closed');
    expect(creation.getState().continuation).toEqual({
      kind: 'created',
      cardKind: 'space',
      cardId: null,
    });
  });

  it('owes no focus when presenting withdraws the pane', () => {
    const creation = creationWith();
    creation.open('alias');
    creation.withdraw();
    expect(creation.getState().pane.status).toBe('closed');
    expect(creation.getState().continuation).toBeNull();
  });
});

describe.each(['returns', 'throws'] as const)('a diagnostic reporter that %s', (reporting) => {
  const reporter = () =>
    vi.fn(() => {
      if (reporting === 'throws') throw new Error('the sink is broken');
    });

  it.each(['synchronous', 'asynchronous'] as const)(
    'recovers a %s creation failure',
    async (timing) => {
      const failure = new Error('the session has gone');
      const reportBreak = reporter();
      const creation = creationWith({
        submit: () => {
          if (timing === 'synchronous') throw failure;
          return Promise.reject(failure);
        },
        reportBreak,
      });
      creation.open('space');
      creation.submit(spaceInput);
      await Promise.resolve();
      expect(reportBreak).toHaveBeenCalledWith(failure);
      expect(creation.getState().pane).toMatchObject({
        status: 'choosing',
        refusal: { fields: {}, form: 'This Card was not created: the session has gone' },
      });
      creation.cancel();
      expect(creation.getState().pane.status).toBe('closed');
    },
  );

  it.each(['synchronous', 'asynchronous'] as const)(
    'recovers a %s choices failure',
    async (timing) => {
      const failure = new Error('the repository is unreachable');
      const reportBreak = reporter();
      const creation = creationWith({
        readChoices: () => {
          if (timing === 'synchronous') throw failure;
          return Promise.reject(failure);
        },
        reportBreak,
      });
      creation.open('space');
      await Promise.resolve();
      expect(reportBreak).toHaveBeenCalledWith(failure);
      expect(creation.getState().pane).toMatchObject({
        status: 'choosing',
        choices: { kind: 'space', targets: { kind: 'unreadable' } },
        listing: {
          fields: {},
          form: 'The choices for this Card could not be read: the repository is unreachable',
        },
      });
      creation.cancel();
      expect(creation.getState().pane.status).toBe('closed');
    },
  );
});
