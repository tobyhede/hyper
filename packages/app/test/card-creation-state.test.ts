import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  CARD_CREATION_CLOSED,
  cardCreationMessage,
  cardCreationReducer,
  createCardCreation,
  type CardCreationAction,
  type CardCreationChoices,
  type CardCreationOutcome,
  type CardCreationRead,
  type CardCreationSeams,
  type CardCreationState,
} from '../src/card-creation';
import type { Continuation, PendingContinuation } from '../src/continuation';

const CARD_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');

const aliasChoices: CardCreationChoices = { kind: 'alias', targets: [] };
const spaceChoices: CardCreationChoices = { kind: 'space', targets: { kind: 'read', spaces: [] } };
const UNREADABLE: CardCreationRead = {
  choices: { kind: 'space', targets: { kind: 'unreadable' } },
  listing: { fields: {}, form: 'The stored Spaces could not be read.' },
};

/** Drive the reducer through a list of actions, the way the shell would. */
const reduce = (state: CardCreationState, ...actions: readonly CardCreationAction[]) =>
  actions.reduce(cardCreationReducer, state);

const choosing = (choices: CardCreationChoices = spaceChoices): CardCreationState =>
  reduce(
    CARD_CREATION_CLOSED,
    { type: 'open', kind: choices.kind },
    { type: 'choices', opening: 1, read: { choices, listing: null } },
  );

/**
 * One mounted Card creation module, driven through its own operations.
 *
 * The module owns its current state, so a test drives it rather than seeding a
 * state and recording the dispatches a shell would have made: what the
 * synchronous-admission rule is about is precisely what a collaborator sees
 * when it reenters, and a recorded dispatch list cannot say.
 *
 * The continuation is recorded rather than composed: what this file is about is
 * *which* continuation each ending earns, and the module that holds one is
 * proved on its own terms in `continuation.test.ts`.
 */
const shell = (seams: Partial<CardCreationSeams> = {}) => {
  const requested: PendingContinuation[] = [];
  const continuation: Continuation = {
    getState: () => ({ pending: null }),
    subscribe: () => () => undefined,
    request: (pending) => requested.push(pending),
    take: () => undefined,
    dispose: () => undefined,
  };
  const creation = createCardCreation({
    readChoices: () => ({ choices: aliasChoices, listing: null }),
    submit: () => ({ kind: 'none' }),
    reportBreak: () => undefined,
    continuation,
    ...seams,
  });
  const published: CardCreationState[] = [];
  creation.subscribe(() => published.push(creation.getState()));
  return { creation, requested, published };
};

/** A module whose pane is already open on `choices`, opened through admission. */
const openedOn = (
  choices: CardCreationChoices = spaceChoices,
  seams: Partial<CardCreationSeams> = {},
) => {
  const driven = shell({ readChoices: () => ({ choices, listing: null }), ...seams });
  driven.creation.open(choices.kind);
  driven.published.length = 0;
  return driven;
};

const RETURN_TO_ADD_CARD: PendingContinuation = {
  target: { kind: 'control', name: 'add-card' },
  select: false,
  then: 'focus',
};

describe('the Card creation pane', () => {
  it('opens on the kind it was asked for, with nothing refused', () => {
    expect(reduce(CARD_CREATION_CLOSED, { type: 'open', kind: 'alias' }).pane).toEqual({
      status: 'choosing',
      choices: { kind: 'alias', targets: [] },
      listing: null,
      refusal: null,
    });
  });

  it('opens the Space Card pane on a list that has not been read yet', () => {
    expect(reduce(CARD_CREATION_CLOSED, { type: 'open', kind: 'space' }).pane).toEqual({
      status: 'choosing',
      choices: { kind: 'space', targets: { kind: 'pending' } },
      listing: null,
      refusal: null,
    });
  });

  /**
   * The pane that stands is the first one, not the last: a second `open` has no
   * read behind it — the shell refuses to make one over an open pane — so
   * letting it through would replace a filled pane with an empty one nothing
   * would ever fill.
   */
  it('cannot offer both kinds at once', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'alias' },
      { type: 'open', kind: 'space' },
    );
    expect(state.pane.status === 'choosing' && state.pane.choices.kind).toBe('alias');
    expect(state.opening).toBe(1);
  });
});

describe('a create in flight', () => {
  it('gives the pane its exits back when it is refused', () => {
    const refusal = { fields: { target: 'That Target is no longer part of the Space.' } };
    const state = reduce(
      choosing(),
      { type: 'submitting' },
      { type: 'settled', outcome: { kind: 'refused', errors: refusal } },
    );
    expect(state.pane).toEqual({
      status: 'choosing',
      choices: spaceChoices,
      listing: null,
      refusal,
    });
  });

  it('does not close the pane while a create is in flight', () => {
    const state = reduce(choosing(), { type: 'submitting' }, { type: 'cancel' });
    expect(state.pane.status).toBe('submitting');
  });

  it('does not close the pane when presenting starts while a create is in flight', () => {
    const state = reduce(choosing(), { type: 'submitting' }, { type: 'presenting' });
    expect(state.pane.status).toBe('submitting');
  });

  /**
   * A replacement discards every open Interaction draft (ADR 0042), and this
   * pane is one. It matters more since the choices became a snapshot read once
   * per opening: a pane left standing over a replaced Space goes on offering
   * Cards from the Space that is gone, and choosing one is refused with
   * `alias-target-not-found` against a row still on screen.
   */
  it('closes the pane when the Space is replaced', () => {
    const state = reduce(choosing(aliasChoices), { type: 'replaced' });
    expect(state.pane.status).toBe('closed');
  });

  it('does not close the pane when a replacement lands while a create is in flight', () => {
    const state = reduce(choosing(), { type: 'submitting' }, { type: 'replaced' });
    expect(state.pane.status).toBe('submitting');
  });

  /**
   * The other half of the rule above: waiting is not the same as forgetting.
   *
   * The wait is only for the Edit to finish, so every ending closes the pane a
   * replacement discarded — including the two that would otherwise reopen it
   * on `choosing`, holding choices read from the Space that is gone.
   */
  it.each([
    ['refused', { kind: 'refused', errors: { fields: {}, form: 'No.' } }],
    ['created', { kind: 'created', cardId: CARD_ID }],
    ['none', { kind: 'none' }],
  ] as const)(
    'closes the discarded pane when the create it waited on is %s',
    (_ending, outcome) => {
      const state = reduce(
        choosing(),
        { type: 'submitting' },
        { type: 'replaced' },
        { type: 'settled', outcome },
      );
      expect(state.pane.status).toBe('closed');
    },
  );

  it('cannot be busy with no pane to disable', () => {
    expect(reduce(CARD_CREATION_CLOSED, { type: 'submitting' }).pane.status).toBe('closed');
  });
});

describe('the one message an open pane draws', () => {
  const listing = UNREADABLE.listing;
  const refusal = { fields: { title: 'A Card needs a Title.' } };

  it('says nothing when there is no pane', () => {
    expect(cardCreationMessage(CARD_CREATION_CLOSED.pane)).toBeNull();
  });

  it('prefers the refused attempt to the failed listing while the pane is editable', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read: UNREADABLE },
      { type: 'submitting' },
      { type: 'settled', outcome: { kind: 'refused', errors: refusal } },
    );
    expect(cardCreationMessage(state.pane)).toEqual(refusal);
  });

  it('falls back to the failed listing when no attempt was refused', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read: UNREADABLE },
    );
    expect(cardCreationMessage(state.pane)).toEqual(listing);
  });

  /**
   * A running attempt has no refusal of its own to draw — the one it began on
   * is over — but nothing typed makes a failed listing readable, so that stays.
   */
  it('draws only the failed listing while an attempt runs', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read: UNREADABLE },
      { type: 'submitting' },
    );
    expect(cardCreationMessage(state.pane)).toEqual(listing);
  });
});

describe('a choices read that failed', () => {
  it('reports it rather than offering an empty list', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read: UNREADABLE },
    );
    expect(state.pane).toEqual({
      status: 'choosing',
      choices: UNREADABLE.choices,
      listing: UNREADABLE.listing,
      refusal: null,
    });
  });

  it('keeps that message while the author types, unlike a refused attempt', () => {
    const unreadable = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read: UNREADABLE },
      { type: 'refusal-stale' },
    );
    expect(unreadable.pane.status === 'choosing' && unreadable.pane.listing).toEqual(
      UNREADABLE.listing,
    );

    const typed = reduce(
      choosing(),
      { type: 'settled', outcome: { kind: 'refused', errors: { fields: { title: 'Required.' } } } },
      { type: 'refusal-stale' },
    );
    expect(typed.pane.status === 'choosing' && typed.pane.refusal).toBeNull();
  });

  it('ignores a read that answers a pane the author has since reopened', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'cancel' },
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read: { choices: spaceChoices, listing: null } },
    );
    expect(state.pane.status === 'choosing' && state.pane.choices).toEqual({
      kind: 'space',
      targets: { kind: 'pending' },
    });
  });
});

describe('where the creation continues', () => {
  const ALIAS = { kind: 'alias', target: CARD_ID, title: '' } as const;

  it('returns to Add Card when the pane is cancelled', () => {
    const { creation, requested } = openedOn();

    creation.cancel();

    expect(creation.getState().pane.status).toBe('closed');
    expect(requested).toEqual([RETURN_TO_ADD_CARD]);
  });

  it('names the created Card when one was created', () => {
    const { creation, requested } = openedOn(aliasChoices, {
      submit: () => ({ kind: 'created', cardId: CARD_ID }),
    });

    creation.submit(ALIAS);

    expect(requested).toEqual([
      { target: { kind: 'card', cardId: CARD_ID }, select: true, then: 'rename' },
    ]);
  });

  /**
   * A Space Card's lifecycle answers a completed Edit and not the identity it
   * minted, and its title was typed on the pane before the Edit ran — so there
   * is nothing left to name and the author goes back to the control.
   */
  it('returns to Add Card when the creation left no Card to continue at', async () => {
    const { creation, requested } = openedOn(spaceChoices, {
      submit: () => Promise.resolve({ kind: 'created', cardId: null }),
    });

    creation.submit({ kind: 'space', targetSpaceId: SPACE_ID, title: 'Recap' });
    await Promise.resolve();
    await Promise.resolve();

    expect(requested).toEqual([RETURN_TO_ADD_CARD]);
  });

  it('owes nothing when presenting takes the pane away', () => {
    const { creation, requested } = openedOn();

    creation.withdraw();

    expect(creation.getState().pane.status).toBe('closed');
    expect(requested).toEqual([]);
  });

  it('owes nothing when the attempt did nothing', () => {
    const { creation, requested } = openedOn(aliasChoices, { submit: () => ({ kind: 'none' }) });

    creation.submit(ALIAS);

    expect(requested).toEqual([]);
  });

  it('owes nothing when the attempt was refused', () => {
    const { creation, requested } = openedOn(aliasChoices, {
      submit: () => ({ kind: 'refused', errors: { fields: {}, form: 'No.' } }),
    });

    creation.submit(ALIAS);

    expect(requested).toEqual([]);
  });

  /** Cancel is refused while an Edit runs, so it owes nothing either. */
  it('owes nothing for a cancel the pane refuses', () => {
    const { creation, requested } = openedOn(spaceChoices, {
      submit: () => new Promise<CardCreationOutcome>(() => undefined),
    });
    creation.submit({ kind: 'space', targetSpaceId: null, title: 'Recap' });

    creation.cancel();

    expect(creation.getState().pane.status).toBe('submitting');
    expect(requested).toEqual([]);
  });
});

describe('the asynchronous shell', () => {
  it('fills a synchronous choices read without ever going busy', () => {
    const read: CardCreationRead = { choices: aliasChoices, listing: null };
    const { creation, published } = shell({ readChoices: () => read });
    creation.open('alias');
    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: aliasChoices,
      listing: null,
      refusal: null,
    });
    expect(published.map(({ pane }) => pane.status)).not.toContain('submitting');
  });

  it('answers an asynchronous read against the opening it was made for', async () => {
    const read: CardCreationRead = { choices: spaceChoices, listing: null };
    const { creation } = shell({ readChoices: () => Promise.resolve(read) });
    creation.open('space');
    await Promise.resolve();
    const { pane } = creation.getState();
    expect(pane.status === 'choosing' && pane.choices).toEqual(spaceChoices);
  });

  it('opens nothing over a pane that is already open', () => {
    const readChoices = vi.fn((): CardCreationRead => ({ choices: spaceChoices, listing: null }));
    const { creation } = shell({ readChoices });
    creation.open('space');

    creation.open('alias');

    expect(readChoices).toHaveBeenCalledTimes(1);
    const { pane } = creation.getState();
    expect(pane.status === 'choosing' && pane.choices.kind).toBe('space');
  });

  /**
   * Admission is installed before the read starts, so the second gesture is
   * refused rather than merely harmless: were it to open again, the opening
   * would advance past the read both calls were made for and the pane would sit
   * on `pending` with Create disabled and Cancel its only exit.
   */
  it('fills the pane when one gesture opens it twice before a render', () => {
    const read: CardCreationRead = { choices: spaceChoices, listing: null };
    const { creation } = shell({ readChoices: () => read });
    creation.open('space');
    creation.open('space');
    const { pane } = creation.getState();
    expect(pane.status === 'choosing' && pane.choices).toEqual(spaceChoices);
  });

  it('goes busy only for a submit that is actually asynchronous', () => {
    const { creation, published } = openedOn(aliasChoices, { submit: () => ({ kind: 'none' }) });
    creation.submit({ kind: 'alias', target: CARD_ID, title: '' });
    expect(published.map(({ pane }) => pane.status)).toEqual(['choosing']);
  });

  it('goes busy for the whole of an asynchronous submit', async () => {
    const attempt = Promise.withResolvers<CardCreationOutcome>();
    const { creation } = openedOn(spaceChoices, { submit: () => attempt.promise });
    creation.submit({ kind: 'space', targetSpaceId: SPACE_ID, title: 'Recap' });
    expect(creation.getState().pane.status).toBe('submitting');

    attempt.resolve({ kind: 'none' });
    await attempt.promise;
    await Promise.resolve();

    expect(creation.getState().pane.status).toBe('choosing');
  });

  it('gives the pane its exits back when a submit rejects, and says what broke', async () => {
    const failure = new Error('the session has gone');
    const reportBreak = vi.fn();
    const { creation } = openedOn(spaceChoices, {
      submit: () => Promise.reject(failure),
      reportBreak,
    });
    creation.submit({ kind: 'space', targetSpaceId: null, title: 'Recap' });
    await Promise.resolve();
    await Promise.resolve();
    expect(reportBreak).toHaveBeenCalledWith(failure);
    const { pane } = creation.getState();
    expect(pane.status === 'choosing' && pane.refusal).toEqual({
      fields: {},
      form: 'This Card was not created: the session has gone',
    });
  });

  it('answers a choices read that rejects with an unreadable list, not a waiting one', async () => {
    const failure = new Error('the repository is unreachable');
    const reportBreak = vi.fn();
    const { creation } = shell({ readChoices: () => Promise.reject(failure), reportBreak });
    creation.open('space');
    await Promise.resolve();
    await Promise.resolve();
    expect(reportBreak).toHaveBeenCalledWith(failure);
    const { pane } = creation.getState();
    // `pending` withholds Create and says the read is still running, so a
    // failure answered with it would leave the author waiting on a read that
    // is over.
    expect(pane.status === 'choosing' && pane.choices).toEqual({
      kind: 'space',
      targets: { kind: 'unreadable' },
    });
    // A read that failed attempted no Edit, so it does not say one failed.
    expect(pane.status === 'choosing' && pane.listing).toEqual({
      fields: {},
      form: 'The choices for this Card could not be read: the repository is unreachable',
    });
  });
});

/**
 * Admission is installed before the collaborator runs, and before React renders.
 *
 * The shell used to guard on the state of the render it was built for, so a
 * seam that reentered synchronously — an Edit whose observers call back into
 * this surface — was admitted a second time against a pane that had already
 * moved. These hold that shut at the module.
 */
describe('admission before the collaborator runs', () => {
  const ALIAS = { kind: 'alias', target: CARD_ID, title: '' } as const;
  const SPACE = { kind: 'space', targetSpaceId: null, title: 'Recap' } as const;

  it('installs admission before notifying an observer that opens another kind', () => {
    const readChoices = vi.fn((kind: 'alias' | 'space'): CardCreationRead => ({
      choices: kind === 'alias' ? aliasChoices : spaceChoices,
      listing: null,
    }));
    const { creation } = shell({ readChoices });
    const unsubscribe = creation.subscribe(() => creation.open('space'));

    creation.open('alias');
    unsubscribe();

    expect(readChoices).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane).toMatchObject({ choices: aliasChoices });
  });

  it('admits the attempt before its collaborator can reenter', () => {
    const submit = vi.fn((): CardCreationOutcome => {
      if (submit.mock.calls.length === 1) {
        creation.submit(ALIAS);
        creation.cancel();
      }
      return { kind: 'created', cardId: CARD_ID };
    });
    const { creation, requested } = openedOn(aliasChoices, { submit });

    creation.submit(ALIAS);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(requested).toEqual([
      { target: { kind: 'card', cardId: CARD_ID }, select: true, then: 'rename' },
    ]);
  });

  it('starts no attempt when closed', () => {
    const submit = vi.fn((): CardCreationOutcome => ({ kind: 'none' }));
    const { creation } = shell({ submit });

    creation.submit(SPACE);

    expect(submit).not.toHaveBeenCalled();
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits one asynchronous attempt and blocks dismissal until it settles', async () => {
    const attempt = Promise.withResolvers<CardCreationOutcome>();
    const submit = vi.fn(() => attempt.promise);
    const { creation, requested } = openedOn(spaceChoices, { submit });

    creation.submit(SPACE);
    creation.submit(SPACE);
    creation.cancel();
    creation.withdraw();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane.status).toBe('submitting');
    expect(requested).toEqual([]);

    attempt.resolve({ kind: 'refused', errors: { fields: { title: 'Required.' } } });
    await attempt.promise;
    await Promise.resolve();
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
    const { creation } = openedOn(aliasChoices, { submit });

    creation.submit(ALIAS);
    expect(creation.getState().pane).toMatchObject({
      status: 'choosing',
      refusal: { fields: { title: 'Required.' } },
    });

    creation.submit(ALIAS);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits no second attempt after synchronous creation', () => {
    const submit = vi.fn((): CardCreationOutcome => ({ kind: 'created', cardId: CARD_ID }));
    const { creation } = openedOn(aliasChoices, { submit });

    creation.submit(ALIAS);
    creation.submit(ALIAS);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('never publishes busy controls for synchronous creation', () => {
    const { creation, published } = openedOn(aliasChoices, {
      submit: () => ({ kind: 'created', cardId: CARD_ID }),
    });

    creation.submit(ALIAS);

    expect(published.map(({ pane }) => pane.status)).toEqual(['closed']);
  });
});
