import type { Card, SpaceFile } from '@project/core';
import { serializeCardFile, type CardFile } from './card-file';

/**
 * A new space: one card, no routes (ADR 0018).
 *
 * The default when there is nothing else to open — not the fixture, which is a
 * purpose-shaped test bed, and not an empty canvas, which offers no gesture a
 * way in and reads as a failure state. One card is the smallest thing that is
 * already a space rather than a promise of one.
 *
 * Returned as the **on-disk shape** — a space file and its card files — rather
 * than as a `Space`. That is what a writer emits and what `loadSpace` takes, so
 * a minted space goes down exactly the path an authored one does, with no second
 * route into the domain (ADR 0010).
 */
export interface NewSpace {
  readonly file: SpaceFile;
  readonly cardFiles: readonly CardFile[];
}

/**
 * The first card's title. An invitation rather than a placeholder: it is the
 * first word the app says to an author, and it is what the graph draws (ADR
 * 0006), so it should not read as an empty slot or as instructions.
 */
const FIRST_CARD_TITLE = 'Start here';

const FIRST_CARD_ID = 'start';

/**
 * Ids are written here rather than generated. ADR 0019 makes them optional and
 * derived on load, and `new-space/01` is that work; until then a minted space
 * carries a constant, which is correct for the one-space-at-a-time app this is
 * and wrong the moment two of them exist side by side.
 */
const NEW_SPACE_ID = 'space';

export function newSpace(): NewSpace {
  // No `layouts` and no `defaultView`. A new space's card carries no position,
  // because centering is the view's job — `fitView` frames whatever is on
  // screen, and a position nobody wrote would be authored content nobody wrote.
  // The Layout arrives when the space opens (ADR 0017), not here.
  const file: SpaceFile = {
    version: 1,
    id: NEW_SPACE_ID,
    title: 'New space',
    routes: [],
  };

  const card: Card = {
    id: FIRST_CARD_ID,
    title: FIRST_CARD_TITLE,
    kind: 'markdown',
    body: '',
  };

  return {
    file,
    cardFiles: [{ path: `cards/${card.id}.md`, text: serializeCardFile(card) }],
  };
}
