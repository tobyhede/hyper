import { expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, type CardFile, type Space } from '@project/graph';
import { elkStrategy } from '@project/react-flow-adapter';
import { canvasProjection } from '../src/canvas-projection';
import { createRendererResolver } from '../src/renderer';
import fixtureJson from '../fixture/space.json';

/** One composed resolver; the fixture names no View, so nothing here converts. */
const resolveRenderer = createRendererResolver({
  newGraphId: () => uuidSchema.parse('00000000-0000-4000-8000-0000000000ff'),
});

/**
 * The fixture's authored positions are ELK's own arrangement of it.
 *
 * The fixture declares two Layouts because a Graph is owned by one (ADR 0040),
 * and it names no `defaultRenderer`, so it still opens in Flow over the flatten
 * across both. Their position maps were therefore seeded from one ELK run over
 * the whole fixture, so that selecting a Layout draws its Cards exactly where
 * Flow already had them and first paint did not move.
 *
 * "First paint is unchanged" is not something a reader can confirm by eye and
 * there is no screenshot baseline in the suite, so it is this instead: the
 * seeded numbers are checked against the arrangement they were generated from.
 * It survives as a regression net — a change to `DEFAULT_ELK_LAYOUT_OPTIONS`
 * that would silently move the fixture fails here rather than going unnoticed.
 *
 * The run is over the *whole* fixture rather than per Layout on purpose: what it
 * pins is the Space-subject view's arrangement, which is what an author opening
 * the fixture actually sees.
 */

/** Half a pixel. Tight enough that a real re-arrangement fails, loose enough
 *  that neither JSON's decimals nor elkjs's floats do. */
const TOLERANCE = 0.5;

const spaceDir = import.meta.glob<string>('../fixture/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function loadFixture(): Space {
  const cardFiles: CardFile[] = Object.entries(spaceDir).map(([path, text]) => ({ path, text }));
  const result = loadSpace(fixtureJson, cardFiles);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));
  return result.space;
}

/** Where ELK puts each fixture Card, through the same seam the canvas uses. */
async function arrangeFixture(space: Space): Promise<Map<string, { x: number; y: number }>> {
  const { strategyGraph } = canvasProjection(space, resolveRenderer(space));
  const laidOut = await elkStrategy()(strategyGraph);
  return new Map(
    // SAFETY: widening the branded `CardId` to its own underlying `string`
    // representation for use as a plain `Map` key — no information is lost.
    laidOut.cards.map((card) => [card.id as string, { x: card.x ?? NaN, y: card.y ?? NaN }]),
  );
}

it("seeds every Layout position from ELK's own arrangement of the whole fixture", async () => {
  const space = loadFixture();
  const arranged = await arrangeFixture(space);

  const seeded = new Map<string, { x: number; y: number }>();
  for (const layout of space.layouts) {
    for (const [cardId, position] of Object.entries(layout.positions)) {
      // The record's values are optional under `noUncheckedIndexedAccess`, and a
      // skipped key is not a hole this can hide in: the key-set comparison below
      // fails for anything that did not make it into the map.
      if (position !== undefined) seeded.set(cardId, position);
    }
  }

  // Every arranged Card is seeded and every seeded Card is arranged, so a Card
  // dropped from a Layout cannot pass by simply not being compared.
  expect([...seeded.keys()].sort()).toEqual([...arranged.keys()].sort());

  for (const [cardId, position] of seeded) {
    const elk = arranged.get(cardId)!;
    expect(Math.abs(position.x - elk.x), `Card ${cardId} x`).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(position.y - elk.y), `Card ${cardId} y`).toBeLessThanOrEqual(TOLERANCE);
  }
});

it('lays the two collections out as separate bands, which is why they split', async () => {
  const space = loadFixture();
  const arranged = await arrangeFixture(space);

  // The split follows the fixture's own structure — two collections sharing no
  // Cards — rather than being imposed on it. ELK draws each as its own band, so
  // the Layouts do not overlap vertically and the seeded halves are each other's
  // complement rather than an arbitrary partition.
  const bands = space.layouts.map((layout) => {
    const ys = Object.keys(layout.positions).map((cardId) => arranged.get(cardId)!.y);
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
  });
  expect(bands).toHaveLength(2);
  // SAFETY: the length check above just proved `bands` holds exactly two
  // elements; `noUncheckedIndexedAccess` doesn't see that runtime check, so
  // destructuring the plain array would otherwise type each element
  // possibly-`undefined`.
  const [first, second] = bands as [(typeof bands)[number], (typeof bands)[number]];
  expect(Math.min(first.bottom, second.bottom)).toBeLessThan(Math.max(first.top, second.top));
});
