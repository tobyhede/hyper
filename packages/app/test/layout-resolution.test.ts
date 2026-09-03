import { describe, expect, it } from 'vitest';
import { uuidSchema, type LayoutId } from '@project/core';
import { loadSpace } from '@project/graph';
import {
  layoutCards,
  LayoutNotFoundError,
  requireDefaultLayout,
  resolveLayout,
} from '../src/layout-resolution';
import { cardFile } from './card-files';

const PLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALSO_PLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OMITTED = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const MISSING = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const load = (defaultLayout: LayoutId | undefined) =>
  loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Space',
      defaultLayout,
      layouts: [
        {
          id: LAYOUT,
          title: 'Layout 1',
          kind: 'positioned',
          // Declared out of the Space's Card order on purpose: the derivation
          // answers in `space.cards` order, and a Placement that agreed with
          // that order could not tell the two apart.
          positions: {
            [ALSO_PLACED]: { x: 40, y: 50, open: false },
            [PLACED]: { x: 12, y: 24, open: false },
          },
          graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
          activeGraph: GRAPH,
        },
      ],
    },
    [cardFile(PLACED), cardFile(ALSO_PLACED), cardFile(OMITTED)],
  );

const loaded = load(LAYOUT);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
const space = loaded.space;

const layoutless = load(undefined);
if (!layoutless.ok) throw new Error(JSON.stringify(layoutless.errors));

describe('requireDefaultLayout', () => {
  it('answers the durable opening selection', () => {
    expect(requireDefaultLayout(space)).toBe(LAYOUT);
  });

  it('throws on a Space with no default Layout', () => {
    expect(() => requireDefaultLayout(layoutless.space)).toThrow(LayoutNotFoundError);
  });
});

describe('resolveLayout', () => {
  it('answers the default Layout when no id is named', () => {
    expect(resolveLayout(space).layout.id).toBe(LAYOUT);
  });

  it('answers the Layout an id names', () => {
    expect(resolveLayout(space, LAYOUT).layout.id).toBe(LAYOUT);
  });

  it('throws on an id that names no Layout', () => {
    expect(() => resolveLayout(space, MISSING)).toThrow(LayoutNotFoundError);
  });
});

describe('layoutCards', () => {
  /**
   * Membership and ordering in one assertion, because they are one guarantee:
   * the Cards a Layout places, as the Space's own objects, in the Space's Card
   * order. No higher seam states the ordering, and the canvas reads it.
   */
  it("answers the Space's own placed Cards in the Space's Card order", () => {
    const cards = layoutCards(space, resolveLayout(space).layout);

    expect(cards.map(({ id }) => id)).toEqual([PLACED, ALSO_PLACED]);
    expect(cards[0]).toBe(space.lookup.card(PLACED));
    expect(cards[1]).toBe(space.lookup.card(ALSO_PLACED));
  });
});
