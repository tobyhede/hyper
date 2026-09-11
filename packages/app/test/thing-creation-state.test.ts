import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  thingCreationMessage,
  createThingCreation,
  type ThingCreationChoices,
  type ThingCreationOutcome,
  type ThingCreationRead,
  type ThingCreationSeams,
  type ThingCreationState,
} from '../src/thing-creation';
import type { Continuation, PendingContinuation } from '../src/continuation';

const THING_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');

const aliasChoices: ThingCreationChoices = { kind: 'alias', targets: [] };
const spaceChoices: ThingCreationChoices = { kind: 'space', targets: { kind: 'read', spaces: [] } };
const aliasInput = { kind: 'alias', target: THING_ID, title: '' } as const;
const spaceInput = { kind: 'space', targetSpaceId: null, title: 'Recap' } as const;
const UNREADABLE: ThingCreationRead = {
  choices: { kind: 'space', targets: { kind: 'unreadable' } },
  listing: { fields: {}, form: 'The stored Spaces could not be read.' },
};

/**
 * One mounted Thing creation module, driven through its own operations.
 *
 * The module owns its current state and its transitions are private, so a test
 * drives it rather than seeding a state and reducing actions over it: what the
 * synchronous-admission rule is about is precisely what a collaborator sees
 * when it reenters, and a list of actions cannot say.
 *
 * The continuation is recorded rather than composed: what this file is about is
 * *which* continuation each ending earns, and the module that holds one is
 * proved on its own terms in `continuation.test.ts`.
 */
const shell = (seams: Partial<ThingCreationSeams> = {}) => {
  const requested: PendingContinuation[] = [];
  const continuation: Continuation = {
    getState: () => ({ pending: null }),
    subscribe: () => () => undefined,
    request: (pending) => requested.push(pending),
    take: () => undefined,
    dispose: () => undefined,
  };
  const creation = createThingCreation({
    readChoices: () => ({ choices: aliasChoices, listing: null }),
    submit: () => ({ kind: 'none' }),
    reportBreak: () => undefined,
    continuation,
    ...seams,
  });
  const published: ThingCreationState[] = [];
  creation.subscribe(() => published.push(creation.getState()));
  return { creation, requested, published };
};

/** A module whose pane is already open on `choices`, opened through admission. */
const openedOn = (
  choices: ThingCreationChoices = spaceChoices,
  seams: Partial<ThingCreationSeams> = {},
) => {
  const driven = shell({ readChoices: () => ({ choices, listing: null }), ...seams });
  driven.creation.open(choices.kind);
  driven.published.length = 0;
  return driven;
};

/** A read that never answers, so a pane is seen exactly as opening left it. */
const neverRead = (): Promise<ThingCreationRead> => new Promise<never>(() => undefined);

/** An attempt that never settles, so a pane is seen while its Edit runs. */
const neverSettles = (): Promise<ThingCreationOutcome> =>
  new Promise<ThingCreationOutcome>(() => undefined);

const RETURN_TO_ADD_THING: PendingContinuation = {
  target: { kind: 'control', name: 'add-thing' },
  select: false,
  then: 'focus',
};

const NAME_CREATED_THING: PendingContinuation = {
  target: { kind: 'thing', thingId: THING_ID },
  select: true,
  then: 'rename',
};

describe('the Thing creation pane', () => {
  it('opens on the kind it was asked for, with nothing refused', () => {
    const { creation } = shell({ readChoices: neverRead });

    creation.open('alias');

    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: { kind: 'alias', targets: [] },
      listing: null,
      refusal: null,
    });
  });

  /**
   * `pending` rather than an empty list: an empty array cannot say whether the
   * repository holds no other Space or the read has simply not answered, and
   * only the first is a list the author may create against.
   */
  it('opens the Space Thing pane on a list that has not been read yet', () => {
    const { creation } = shell({ readChoices: neverRead });

    creation.open('space');

    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: { kind: 'space', targets: { kind: 'pending' } },
      listing: null,
      refusal: null,
    });
  });
});

describe('a replacement while the pane is up', () => {
  /**
   * A replacement discards every open Interaction draft (ADR 0042), and this
   * pane is one. It matters more since the choices became a snapshot read once
   * per opening: a pane left standing over a replaced Space goes on offering
   * Things from the Space that is gone, and choosing one is refused with
   * `alias-target-not-found` against a row still on screen.
   */
  it('closes the pane when the Space is replaced', () => {
    const { creation, requested } = openedOn(aliasChoices);

    creation.discard();

    expect(creation.getState().pane.status).toBe('closed');
    // The epoch that replaced the Space has already discarded whatever
    // continuation this pane was owed, so it asks for none.
    expect(requested).toEqual([]);
  });

  it('does not close the pane when a replacement lands while a create is in flight', () => {
    const { creation } = openedOn(spaceChoices, { submit: neverSettles });
    creation.submit(spaceInput);

    creation.discard();

    expect(creation.getState().pane.status).toBe('submitting');
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
    ['created', { kind: 'created', thingId: THING_ID }],
    ['none', { kind: 'none' }],
  ] as const)(
    'closes the discarded pane when the create it waited on is %s',
    async (_ending, outcome) => {
      const attempt = Promise.withResolvers<ThingCreationOutcome>();
      const { creation } = openedOn(spaceChoices, { submit: () => attempt.promise });
      creation.submit(spaceInput);
      creation.discard();

      attempt.resolve(outcome);
      await attempt.promise;
      await Promise.resolve();

      expect(creation.getState().pane.status).toBe('closed');
    },
  );
});

describe('the one message an open pane draws', () => {
  const listing = UNREADABLE.listing;
  const refusal = { fields: { title: 'A Thing needs a Title.' } };

  it('says nothing when there is no pane', () => {
    expect(thingCreationMessage({ status: 'closed' })).toBeNull();
  });

  it('prefers the refused attempt to the failed listing while the pane is editable', () => {
    expect(
      thingCreationMessage({
        status: 'choosing',
        choices: UNREADABLE.choices,
        listing,
        refusal,
      }),
    ).toEqual(refusal);
  });

  it('falls back to the failed listing when no attempt was refused', () => {
    expect(
      thingCreationMessage({
        status: 'choosing',
        choices: UNREADABLE.choices,
        listing,
        refusal: null,
      }),
    ).toEqual(listing);
  });

  /**
   * A running attempt has no refusal of its own to draw — the one it began on
   * is over — but nothing typed makes a failed listing readable, so that stays.
   */
  it('draws only the failed listing while an attempt runs', () => {
    expect(
      thingCreationMessage({
        status: 'submitting',
        choices: UNREADABLE.choices,
        listing,
        discarded: false,
      }),
    ).toEqual(listing);
  });
});

describe('a choices read that failed', () => {
  it('reports it rather than offering an empty list', () => {
    const { creation } = shell({ readChoices: () => UNREADABLE });

    creation.open('space');

    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: UNREADABLE.choices,
      listing: UNREADABLE.listing,
      refusal: null,
    });
  });

  it('keeps that message while the author types, unlike a refused attempt', () => {
    const { creation } = shell({
      readChoices: () => UNREADABLE,
      submit: () => ({ kind: 'refused', errors: { fields: { title: 'Required.' } } }),
    });
    creation.open('space');
    creation.submit(spaceInput);
    expect(creation.getState().pane).toMatchObject({
      refusal: { fields: { title: 'Required.' } },
    });

    creation.refusalStale();

    expect(creation.getState().pane).toEqual({
      status: 'choosing',
      choices: UNREADABLE.choices,
      listing: UNREADABLE.listing,
      refusal: null,
    });
  });

  it('keeps a failed listing visible while an attempt is running', async () => {
    const read = Promise.withResolvers<ThingCreationRead>();
    const { creation } = shell({ readChoices: () => read.promise, submit: neverSettles });
    creation.open('space');
    creation.submit(spaceInput);

    read.resolve(UNREADABLE);
    await read.promise;
    await Promise.resolve();
    creation.refusalStale();

    expect(creation.getState().pane).toEqual({
      status: 'submitting',
      choices: UNREADABLE.choices,
      listing: UNREADABLE.listing,
      discarded: false,
    });
  });
});

/**
 * A read answers the opening it was made for, and nothing else.
 *
 * Both endings are reachable with one gesture each: cancelling the Space Thing
 * pane while its listing is in flight, and doing that then opening a second
 * pane before the first read answers.
 */
describe('a choices read that answers a pane that has moved on', () => {
  it('ignores a choices read after the pane has closed', async () => {
    const read = Promise.withResolvers<ThingCreationRead>();
    const { creation } = shell({ readChoices: () => read.promise });
    creation.open('space');
    creation.cancel();

    read.resolve({ choices: spaceChoices, listing: null });
    await read.promise;
    await Promise.resolve();

    expect(creation.getState().pane.status).toBe('closed');
  });

  it('ignores a read that answers a pane the author has since reopened', async () => {
    const first = Promise.withResolvers<ThingCreationRead>();
    const second = Promise.withResolvers<ThingCreationRead>();
    const readChoices = vi
      .fn<ThingCreationSeams['readChoices']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { creation } = shell({ readChoices });
    creation.open('space');
    creation.cancel();
    creation.open('space');

    first.resolve(UNREADABLE);
    await first.promise;
    await Promise.resolve();

    expect(creation.getState().pane).toMatchObject({
      choices: { kind: 'space', targets: { kind: 'pending' } },
      listing: null,
    });

    second.resolve({ choices: spaceChoices, listing: null });
    await second.promise;
    await Promise.resolve();

    expect(creation.getState().pane).toMatchObject({ choices: spaceChoices, listing: null });
  });
});

describe('where the creation continues', () => {
  it('returns to Add Thing when the pane is cancelled', () => {
    const { creation, requested } = openedOn();

    creation.cancel();

    expect(creation.getState().pane.status).toBe('closed');
    expect(requested).toEqual([RETURN_TO_ADD_THING]);
  });

  it('names the created Thing when one was created', () => {
    const { creation, requested } = openedOn(aliasChoices, {
      submit: () => ({ kind: 'created', thingId: THING_ID }),
    });

    creation.submit(aliasInput);

    expect(requested).toEqual([NAME_CREATED_THING]);
  });

  /**
   * A Space Thing's lifecycle answers a completed Edit and not the identity it
   * minted, and its title was typed on the pane before the Edit ran — so there
   * is nothing left to name and the author goes back to the control.
   */
  it('returns to Add Thing when the creation left no Thing to continue at', async () => {
    const { creation, requested } = openedOn(spaceChoices, {
      submit: () => Promise.resolve({ kind: 'created', thingId: null }),
    });

    creation.submit({ kind: 'space', targetSpaceId: SPACE_ID, title: 'Recap' });
    await Promise.resolve();
    await Promise.resolve();

    expect(requested).toEqual([RETURN_TO_ADD_THING]);
  });

  it('owes nothing when presenting takes the pane away', () => {
    const { creation, requested } = openedOn();

    creation.withdraw();

    expect(creation.getState().pane.status).toBe('closed');
    expect(requested).toEqual([]);
  });

  it('owes nothing when the attempt did nothing', () => {
    const { creation, requested } = openedOn(aliasChoices, { submit: () => ({ kind: 'none' }) });

    creation.submit(aliasInput);

    expect(requested).toEqual([]);
  });

  it('owes nothing when the attempt was refused', () => {
    const { creation, requested } = openedOn(aliasChoices, {
      submit: () => ({ kind: 'refused', errors: { fields: {}, form: 'No.' } }),
    });

    creation.submit(aliasInput);

    expect(requested).toEqual([]);
  });

  /** Cancel is refused while an Edit runs, so it owes nothing either. */
  it('owes nothing for a cancel the pane refuses', () => {
    const { creation, requested } = openedOn(spaceChoices, { submit: neverSettles });
    creation.submit(spaceInput);

    creation.cancel();

    expect(creation.getState().pane.status).toBe('submitting');
    expect(requested).toEqual([]);
  });
});

describe('the asynchronous shell', () => {
  it('fills a synchronous choices read without ever going busy', () => {
    const read: ThingCreationRead = { choices: aliasChoices, listing: null };
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
    const read: ThingCreationRead = { choices: spaceChoices, listing: null };
    const { creation } = shell({ readChoices: () => Promise.resolve(read) });
    creation.open('space');
    await Promise.resolve();
    const { pane } = creation.getState();
    expect(pane.status === 'choosing' && pane.choices).toEqual(spaceChoices);
  });

  /**
   * The pane that stands is the first one, not the last: a second `open` has no
   * read behind it — admission refuses to make one over an open pane — so
   * letting it through would replace a filled pane with an empty one nothing
   * would ever fill.
   */
  it('opens nothing over a pane that is already open', () => {
    const readChoices = vi.fn((): ThingCreationRead => ({ choices: spaceChoices, listing: null }));
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
    const read: ThingCreationRead = { choices: spaceChoices, listing: null };
    const { creation } = shell({ readChoices: () => read });
    creation.open('space');
    creation.open('space');
    const { pane } = creation.getState();
    expect(pane.status === 'choosing' && pane.choices).toEqual(spaceChoices);
  });

  it('goes busy only for a submit that is actually asynchronous', () => {
    const { creation, published } = openedOn(aliasChoices, { submit: () => ({ kind: 'none' }) });
    creation.submit(aliasInput);
    expect(published.map(({ pane }) => pane.status)).toEqual(['choosing']);
  });

  it('goes busy for the whole of an asynchronous submit', async () => {
    const attempt = Promise.withResolvers<ThingCreationOutcome>();
    const { creation } = openedOn(spaceChoices, { submit: () => attempt.promise });
    creation.submit({ kind: 'space', targetSpaceId: SPACE_ID, title: 'Recap' });
    expect(creation.getState().pane.status).toBe('submitting');

    attempt.resolve({ kind: 'none' });
    await attempt.promise;
    await Promise.resolve();

    expect(creation.getState().pane.status).toBe('choosing');
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
  it('installs admission before notifying an observer that opens another kind', () => {
    const readChoices = vi.fn((kind: 'alias' | 'space'): ThingCreationRead => ({
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
    const submit = vi.fn((): ThingCreationOutcome => {
      if (submit.mock.calls.length === 1) {
        creation.submit(aliasInput);
        creation.cancel();
      }
      return { kind: 'created', thingId: THING_ID };
    });
    const { creation, requested } = openedOn(aliasChoices, { submit });

    creation.submit(aliasInput);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(requested).toEqual([NAME_CREATED_THING]);
  });

  it('starts no attempt when closed', () => {
    const submit = vi.fn((): ThingCreationOutcome => ({ kind: 'none' }));
    const { creation } = shell({ submit });

    creation.submit(spaceInput);

    expect(submit).not.toHaveBeenCalled();
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits one asynchronous attempt and blocks dismissal until it settles', async () => {
    const attempt = Promise.withResolvers<ThingCreationOutcome>();
    const submit = vi.fn(() => attempt.promise);
    const { creation, requested } = openedOn(spaceChoices, { submit });

    creation.submit(spaceInput);
    creation.submit(spaceInput);
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
      .fn<ThingCreationSeams['submit']>()
      .mockReturnValueOnce({ kind: 'refused', errors: { fields: { title: 'Required.' } } })
      .mockReturnValueOnce({ kind: 'created', thingId: THING_ID });
    const { creation } = openedOn(aliasChoices, { submit });

    creation.submit(aliasInput);
    expect(creation.getState().pane).toMatchObject({
      status: 'choosing',
      choices: aliasChoices,
      listing: null,
      refusal: { fields: { title: 'Required.' } },
    });

    creation.submit(aliasInput);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('admits no second attempt after synchronous creation', () => {
    const submit = vi.fn((): ThingCreationOutcome => ({ kind: 'created', thingId: THING_ID }));
    const { creation } = openedOn(aliasChoices, { submit });

    creation.submit(aliasInput);
    creation.submit(aliasInput);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(creation.getState().pane.status).toBe('closed');
  });

  it('never publishes busy controls for synchronous creation', () => {
    const { creation, published } = openedOn(aliasChoices, {
      submit: () => ({ kind: 'created', thingId: THING_ID }),
    });

    creation.submit(aliasInput);

    expect(published.map(({ pane }) => pane.status)).toEqual(['closed']);
  });
});

/**
 * A diagnostic is never the failure path of the work it describes.
 *
 * The recovery this module owes on every one of these paths is a *transition*,
 * and each sits behind the report. A sink that threw would take the transition
 * with it: the pane stays `submitting` with Create, Cancel and Escape all
 * disabled and nothing left to end it, or stays on a list that says it is still
 * being read — and on the synchronous arms the throw escapes into the event
 * handler that submitted, taking the canvas down. The reporter is injected and
 * required with no default (ADR 0016), so it is exactly the collaborator this
 * module cannot vouch for: `createNonThrowingReporter` is the repository's
 * answer and it is applied here rather than trusted of whoever composed this.
 *
 * Crossed with both timings, because the sink sits on four distinct paths and
 * only the two synchronous ones can reach the caller's stack.
 */
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
      const { creation } = openedOn(spaceChoices, {
        submit: () => {
          if (timing === 'synchronous') throw failure;
          return Promise.reject(failure);
        },
        reportBreak,
      });

      creation.submit(spaceInput);
      await Promise.resolve();
      await Promise.resolve();

      expect(reportBreak).toHaveBeenCalledWith(failure);
      expect(creation.getState().pane).toMatchObject({
        status: 'choosing',
        refusal: { fields: {}, form: 'This Thing was not created: the session has gone' },
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
      const { creation } = shell({
        readChoices: () => {
          if (timing === 'synchronous') throw failure;
          return Promise.reject(failure);
        },
        reportBreak,
      });

      creation.open('space');
      await Promise.resolve();
      await Promise.resolve();

      expect(reportBreak).toHaveBeenCalledWith(failure);
      // `pending` withholds Create and says the read is still running, so a
      // failure answered with it would leave the author waiting on a read that
      // is over. A read that failed attempted no Edit, so it says the list
      // failed rather than that a creation did.
      expect(creation.getState().pane).toMatchObject({
        status: 'choosing',
        choices: { kind: 'space', targets: { kind: 'unreadable' } },
        listing: {
          fields: {},
          form: 'The choices for this Thing could not be read: the repository is unreachable',
        },
      });
      creation.cancel();
      expect(creation.getState().pane.status).toBe('closed');
    },
  );
});
