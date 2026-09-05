import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  CARD_CREATION_CLOSED,
  cardCreationReducer,
  createCardCreation,
  type CardCreationAction,
  type CardCreationChoices,
  type CardCreationOutcome,
  type CardCreationRead,
  type CardCreationSeams,
  type CardCreationState,
} from '../src/card-creation';

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

/** The asynchronous shell over recorded dispatches, so no React tree is needed. */
const shell = (state: CardCreationState, seams: Partial<CardCreationSeams> = {}) => {
  const dispatched: CardCreationAction[] = [];
  const creation = createCardCreation(state, (action) => dispatched.push(action), {
    readChoices: () => ({ choices: aliasChoices, listing: null }),
    submit: () => ({ kind: 'none' }),
    reportBreak: () => undefined,
    ...seams,
  });
  return { creation, dispatched };
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

  it('cannot offer both kinds at once', () => {
    const state = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'alias' },
      { type: 'open', kind: 'space' },
    );
    expect(state.pane.status === 'choosing' && state.pane.choices.kind).toBe('alias');
  });

  /**
   * The shell declines to open over an open pane, but the rule is the state
   * machine's: enforcing it only in a closure over the state as it was read
   * leaves two dispatches from one render able to count two openings, and a
   * read then answers an opening that no longer exists.
   */
  it('counts one opening for an open request the pane is already answering', () => {
    const twice = reduce(
      CARD_CREATION_CLOSED,
      { type: 'open', kind: 'space' },
      { type: 'open', kind: 'space' },
    );
    expect(twice.opening).toBe(1);

    const filled = reduce(twice, {
      type: 'choices',
      opening: 1,
      read: { choices: spaceChoices, listing: null },
    });
    expect(filled.pane.status === 'choosing' && filled.pane.choices).toEqual(spaceChoices);
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
    expect(state.continuation).toBeNull();
  });

  it('does not close the pane when presenting starts while a create is in flight', () => {
    const state = reduce(choosing(), { type: 'submitting' }, { type: 'presenting' });
    expect(state.pane.status).toBe('submitting');
  });

  it('cannot be busy with no pane to disable', () => {
    expect(reduce(CARD_CREATION_CLOSED, { type: 'submitting' }).pane.status).toBe('closed');
  });

  it('begins no second attempt while one is running', () => {
    const submit = vi.fn((): CardCreationOutcome => ({ kind: 'none' }));
    const { creation, dispatched } = shell(reduce(choosing(), { type: 'submitting' }), { submit });
    creation.submit({ kind: 'space', targetSpaceId: null, title: 'Recap' });
    expect(submit).not.toHaveBeenCalled();
    expect(dispatched).toEqual([]);
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
  it('returns to Add Card when the pane is cancelled', () => {
    const state = reduce(choosing(), { type: 'cancel' });
    expect(state.pane.status).toBe('closed');
    expect(state.continuation).toEqual({
      target: { kind: 'control', name: 'add-card' },
      select: false,
      then: 'focus',
    });
  });

  it('names the created Card when one was created', () => {
    const state = reduce(choosing(aliasChoices), {
      type: 'settled',
      outcome: { kind: 'created', cardId: CARD_ID },
    });
    expect(state.pane.status).toBe('closed');
    expect(state.continuation).toEqual({
      target: { kind: 'card', cardId: CARD_ID },
      select: true,
      then: 'rename',
    });
  });

  it('returns to Add Card when the creation left no Card to continue at', () => {
    const state = reduce(choosing(), {
      type: 'settled',
      outcome: { kind: 'created', cardId: null },
    });
    expect(state.pane.status).toBe('closed');
    expect(state.continuation).toEqual({
      target: { kind: 'control', name: 'add-card' },
      select: false,
      then: 'focus',
    });
  });

  it('is spent once', () => {
    const cancelled = reduce(choosing(), { type: 'cancel' });
    expect(reduce(cancelled, { type: 'continued' }).continuation).toBeNull();
  });

  it('owes nothing when presenting takes the pane away', () => {
    const state = reduce(choosing(), { type: 'presenting' });
    expect(state.pane.status).toBe('closed');
    expect(state.continuation).toBeNull();
  });

  it('stays open, owing nothing, when the attempt did nothing', () => {
    const state = reduce(choosing(aliasChoices), { type: 'settled', outcome: { kind: 'none' } });
    expect(state.pane.status).toBe('choosing');
    expect(state.continuation).toBeNull();
  });
});

describe('the asynchronous shell', () => {
  it('fills a synchronous choices read without ever going busy', () => {
    const read: CardCreationRead = { choices: aliasChoices, listing: null };
    const { creation, dispatched } = shell(CARD_CREATION_CLOSED, { readChoices: () => read });
    creation.open('alias');
    expect(dispatched).toEqual([
      { type: 'open', kind: 'alias' },
      { type: 'choices', opening: 1, read },
    ]);
  });

  it('answers an asynchronous read against the opening it was made for', async () => {
    const read: CardCreationRead = { choices: spaceChoices, listing: null };
    const { creation, dispatched } = shell(CARD_CREATION_CLOSED, {
      readChoices: () => Promise.resolve(read),
    });
    creation.open('space');
    await Promise.resolve();
    expect(dispatched).toEqual([
      { type: 'open', kind: 'space' },
      { type: 'choices', opening: 1, read },
    ]);
  });

  it('opens nothing over a pane that is already open', () => {
    const { creation, dispatched } = shell(choosing());
    creation.open('alias');
    expect(dispatched).toEqual([]);
  });

  it('goes busy only for a submit that is actually asynchronous', () => {
    const { creation, dispatched } = shell(choosing(aliasChoices), {
      submit: () => ({ kind: 'none' }),
    });
    creation.submit({ kind: 'alias', target: CARD_ID, title: '' });
    expect(dispatched).toEqual([{ type: 'settled', outcome: { kind: 'none' } }]);
  });

  it('goes busy for the whole of an asynchronous submit', async () => {
    const outcome: CardCreationOutcome = { kind: 'none' };
    const { creation, dispatched } = shell(choosing(), { submit: () => Promise.resolve(outcome) });
    creation.submit({ kind: 'space', targetSpaceId: SPACE_ID, title: 'Recap' });
    expect(dispatched).toEqual([{ type: 'submitting' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(dispatched).toEqual([{ type: 'submitting' }, { type: 'settled', outcome }]);
  });

  it('gives the pane its exits back when a submit rejects, and says what broke', async () => {
    const failure = new Error('the session has gone');
    const reportBreak = vi.fn();
    const { creation, dispatched } = shell(choosing(), {
      submit: () => Promise.reject(failure),
      reportBreak,
    });
    creation.submit({ kind: 'space', targetSpaceId: null, title: 'Recap' });
    await Promise.resolve();
    await Promise.resolve();
    expect(reportBreak).toHaveBeenCalledWith(failure);
    const settled = dispatched[1];
    expect(settled?.type === 'settled' && settled.outcome).toEqual({
      kind: 'refused',
      errors: { fields: {}, form: 'This Card was not created: the session has gone' },
    });
  });

  it('answers a choices read that rejects with an unreadable list, not a waiting one', async () => {
    const failure = new Error('the repository is unreachable');
    const reportBreak = vi.fn();
    const { creation, dispatched } = shell(CARD_CREATION_CLOSED, {
      readChoices: () => Promise.reject(failure),
      reportBreak,
    });
    creation.open('space');
    await Promise.resolve();
    await Promise.resolve();
    expect(reportBreak).toHaveBeenCalledWith(failure);
    const filled = dispatched[1];
    // `pending` withholds Create and says the read is still running, so a
    // failure answered with it would leave the author waiting on a read that
    // is over.
    expect(filled?.type === 'choices' && filled.read).toEqual({
      choices: { kind: 'space', targets: { kind: 'unreadable' } },
      // A read that failed attempted no Edit, so it does not say one failed.
      listing: {
        fields: {},
        form: 'The choices for this Card could not be read: the repository is unreachable',
      },
    });
  });
});
