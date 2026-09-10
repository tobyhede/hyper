import { describe, expect, it } from 'vitest';
import type { Layout, LayoutId, SpaceSnapshot } from '@project/core';
import { newUuid } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import {
  editSelectedLayout,
  exitSpace,
  openTree,
  opened,
  type OpenEntry,
  type SessionState,
} from '../src/dock-model';

const layout = (id: string, title: string): Layout => ({
  id: newUuid(),
  title,
  kind: 'positioned',
  positions: {},
  graphs: [{ id: newUuid(), title: `${id} graph`, edges: [] }],
});

const first = layout('a', 'Collection 1');
const second = layout('b', 'Collection 2');

const snapshot: SpaceSnapshot = {
  id: newUuid(),
  document: { version: 1, title: 'Rendering', layouts: [first, second], defaultLayout: first.id },
  cards: [],
};

const entryOn = (layoutId: LayoutId): OpenEntry => ({
  snapshot,
  from: null,
  layoutId,
  graphId: null,
  persistence: { kind: 'settled' },
});

const titles = (next: OpenEntry): readonly string[] =>
  (next.snapshot.document.layouts ?? []).map((each) => each.title);

/**
 * Which Layout an Edit lands on.
 *
 * **It has to be the one the entry being written selects**, and the entry is
 * the only place that can answer. The hook resolved it from a `selectedId`
 * captured during render and then spent it inside a functional state updater
 * that had correctly gone and fetched the *live* entry — so the target and the
 * thing being targeted came from two different moments. A gesture that selected
 * a Layout and edited it in one tick wrote into the Layout that had been
 * selected before it.
 *
 * That is the same stale-closure class the drag gesture had, and the same
 * answer: take the state being written as an argument rather than closing over
 * a rendered copy of it. This test is what says the target follows the entry —
 * two entries differing in nothing but `layoutId`, one Edit, two different
 * Layouts changed.
 */
describe('an Edit on the selected Layout', () => {
  it('lands on the Layout the entry selects, not one captured elsewhere', () => {
    const rename = (each: Layout): Layout => ({ ...each, title: 'Renamed' });

    expect(titles(editSelectedLayout(entryOn(first.id), rename))).toEqual([
      'Renamed',
      'Collection 2',
    ]);
    expect(titles(editSelectedLayout(entryOn(second.id), rename))).toEqual([
      'Collection 1',
      'Renamed',
    ]);
  });
});

/**
 * Where a Space opens, when the document does not say.
 *
 * `defaultLayout` is `uuidSchema.optional()` (ADR 0079 makes it the durable
 * opening selection, and a stored layoutless Space has none until first working
 * load initializes one). So the entry's selection is a Layout id **or nothing**,
 * and the absent case has to be spelled as nothing.
 *
 * It was spelled `String(snapshot.document.defaultLayout)`, which for a
 * layoutless Space is the five-letter string `"undefined"` — an id no Layout can
 * ever carry, sitting in the field the whole surface reads to decide what is
 * drawing. Every fixture this prototype ships declares a `defaultLayout`, so the
 * fallback to the first Layout hid it; the moment a Space arrives without one
 * the entry claims a selection it does not have, and `editSelectedLayout` is
 * asked to find a Layout by a name nothing answers to.
 */
describe('opening a Space', () => {
  it('opens a layoutless Space on no Layout at all', () => {
    const layoutless: SpaceSnapshot = {
      id: newUuid(),
      document: { version: 1, title: 'Nothing authored yet' },
      cards: [],
    };

    expect(opened(layoutless, null).layoutId).toBeNull();
  });

  it('opens a Space the document places on the Layout it names', () => {
    expect(opened(snapshot, null).layoutId).toBe(first.id);
  });
});

/* ------------------------------------------------------------------- exit */

const spaceNamed = (title: string): SpaceSnapshot => ({
  id: newUuid(),
  document: { version: 1, title },
  cards: [],
});

const meta = spaceNamed('Meta');
const platform = spaceNamed('Platform');
const designSystem = spaceNamed('Design system');
const rendering = spaceNamed('Rendering');
const traversal = spaceNamed('Traversal');

/**
 * `Meta ▸ Platform ▸ Design system ▸ Rendering`, with `Traversal` opened off
 * Meta beside it — the prototype's own fixture, which is a tree rather than a
 * path so that closing one Space has somewhere to go wrong.
 */
const session = (persistence?: SpaceSessionState['persistence']): SessionState => {
  const open = new Map([
    [meta.id, opened(meta, null)],
    [platform.id, opened(platform, meta.id)],
    [designSystem.id, opened(designSystem, platform.id)],
    [rendering.id, opened(rendering, designSystem.id)],
    [traversal.id, opened(traversal, meta.id)],
  ]);
  const live = open.get(rendering.id);
  if (persistence !== undefined && live !== undefined) {
    open.set(rendering.id, { ...live, persistence });
  }
  return { open, currentId: rendering.id, metaSpaceId: meta.id };
};

const retryable = {
  kind: 'retryable-failure',
  code: 'network',
  message: 'The space could not be reached.',
} as const;

const permanent = {
  kind: 'permanent-failure',
  code: 'forbidden',
  message: 'Permission denied',
} as const;

/**
 * Exit closes **one** Space.
 *
 * The prototype used to close a whole subtree with it, on the grounds that
 * leaving the Spaces opened through it behind would either orphan them or
 * re-parent them onto a Space they were never entered from. ADR 0068 settles
 * it the other way — *"closing one Space never closes another"* — and the
 * built `exit` in `packages/app/src/open-spaces.ts` has always done that.
 *
 * So the orphan question is real and this is the answer: the entries below the
 * exited one hang off the nearest Space that is still open, which is the
 * exited one's own opener. It is the display-only picture of session history
 * moving up a level, not a claim about structure — nothing acts on it, and
 * Space Card references form a DAG with no canonical parent anyway (ADR 0074).
 */
/**
 * The session as {@link openTree} takes it.
 *
 * The model stopped taking the fixture's own `SessionState` when the application
 * became its second caller: `OpenSpacesState` keeps the Opener in a map beside
 * its entries rather than on them, so neither session is convertible to the
 * other and a tree that took either would be one its other caller had to reshape
 * itself for. This is the reshaping, in the one test that needs it.
 */
const rowsOf = (state: SessionState) =>
  [...state.open].map(([spaceId, entry]) => ({
    spaceId,
    title: entry.snapshot.document.title,
    from: entry.from,
    persistence: entry.persistence,
  }));

describe('exiting a Space', () => {
  it('closes one Space and never the Spaces opened through it', () => {
    const { result, session: next } = exitSpace(session(), designSystem.id);

    expect(result).toEqual({ kind: 'exited' });
    expect([...next.open.keys()]).toEqual([meta.id, platform.id, rendering.id, traversal.id]);
  });

  it('keeps a Space whose opener exited in the Open Spaces menu, under the nearest still-open one', () => {
    const { session: next } = exitSpace(session(), designSystem.id);

    expect(openTree(rowsOf(next)).map((row) => [row.title, row.depth])).toEqual([
      ['Meta', 0],
      ['Platform', 1],
      ['Rendering', 2],
      ['Traversal', 1],
    ]);
  });

  it('refuses the root, which is where navigation starts', () => {
    const { result, session: next } = exitSpace(session(), meta.id);

    expect(result).toEqual({ kind: 'refused', refusal: { code: 'meta-space-permanent' } });
    expect(next.open.size).toBe(5);
  });

  it('refuses a Space that cannot save, naming the recovery that already exists', () => {
    expect(exitSpace(session({ kind: 'failed', failure: retryable }), rendering.id)).toEqual({
      result: {
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', recovery: 'retry' },
      },
      session: session({ kind: 'failed', failure: retryable }),
    });
    expect(
      exitSpace(
        session({ kind: 'conflicted', current: undefined, baseline: undefined }),
        rendering.id,
      ).result,
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', recovery: 'resolve-conflict' },
    });
  });

  it('warns before discarding rejected work, and exits once that is confirmed', () => {
    const rejected = session({ kind: 'rejected', failure: permanent });

    expect(exitSpace(rejected, rendering.id).result).toEqual({
      kind: 'warning',
      warning: 'persistence-rejected',
    });
    expect(exitSpace(rejected, rendering.id).session.open.has(rendering.id)).toBe(true);

    const confirmed = exitSpace(rejected, rendering.id, { warning: 'persistence-rejected' });

    expect(confirmed.result).toEqual({ kind: 'exited' });
    expect(confirmed.session.open.has(rendering.id)).toBe(false);
  });

  it('lands on the first Space still open when the one exited was on the canvas', () => {
    expect(exitSpace(session(), rendering.id).session.currentId).toBe(meta.id);
  });

  it('moves nobody when the Space exited is not the one on the canvas', () => {
    expect(exitSpace(session(), traversal.id).session.currentId).toBe(rendering.id);
  });
});
