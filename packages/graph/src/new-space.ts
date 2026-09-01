import { newUuid, SPACE_FILE_VERSION, type Card, type SpaceFile, type UUID } from '@project/core';
import { serializeCardFile, type CardFile } from './card-file';

/**
 * A new space: one card, no layouts and so no graphs (ADR 0018).
 *
 * The default when there is nothing else to open — not the fixture, which is a
 * purpose-shaped test bed, and not an empty canvas, which offers no gesture a
 * way in and reads as a failure state. One card is the smallest thing that is
 * already a space rather than a promise of one.
 *
 * Returned as the **on-disk shape** — a space file and its card files — rather
 * than as a `Space`. That is what a writer emits and what `loadSpace` takes, so
 * a minted space goes down exactly the path an authored one does, with no second
 * graph into the domain (ADR 0010).
 */
export interface NewSpace {
  readonly file: SpaceFile;
  readonly cardFiles: readonly CardFile[];
}

/** The first neutral Card title; later creation continues the same sequence. */
const FIRST_CARD_TITLE = 'Card 1';

/** Inputs to the one normal-Space initializer used by every provisioning path. */
export interface InitializeSpaceOptions {
  /** Seeds both the Space and its first Card; later edits make them independent. */
  readonly title: string;
  /** The composition-owned identity source for the Space and first Card. */
  readonly newId: () => UUID;
}

/**
 * Initialize a normal authored Space through the same on-disk intake as every
 * other Space.
 *
 * A normal Space begins with one Markdown Card and no authored Layout. Meta
 * bootstrap, ordinary startup and Space Card creation share this shape; the
 * application supplies a Computed View until an Edit authors a Layout.
 */
export function initializeSpace({ title, newId }: InitializeSpaceOptions): NewSpace {
  const spaceId = newId();
  const cardId = newId();
  const card: Card = { id: cardId, title, kind: 'markdown', body: '' };

  return {
    file: {
      version: SPACE_FILE_VERSION,
      id: spaceId,
      title,
    },
    cardFiles: [{ path: `cards/${card.id}.md`, text: serializeCardFile(card) }],
  };
}

export function newSpace(): NewSpace {
  const spaceId = newUuid();
  const cardId = newUuid();
  // Neither `layouts` nor `defaultRenderer`, and they are two statements rather
  // than one. No Layouts *is* also "no graphs" — a Layout owns at least one (ADR
  // 0040) and there is nowhere else for a Graph to live — and that is the state a
  // new space starts in. No `defaultRenderer` says nothing about graphs at all:
  // the field names a Computed View as readily as an authored
  // Layout (ADR 0055), so leaving it unset only declines to record which renderer
  // opens, and the application falls back to its default Computed View.
  //
  // A new space's card carries no position either, because centering is the
  // view's job — `fitView` frames whatever is on screen, and a position nobody
  // wrote would be authored content nobody wrote. The Layout arrives when the
  // space is edited (ADR 0025), not here and not on open: a space that is only
  // read keeps none.
  const file: SpaceFile = {
    version: SPACE_FILE_VERSION,
    id: spaceId,
    title: 'New space',
  };

  const card: Card = {
    id: cardId,
    title: FIRST_CARD_TITLE,
    kind: 'markdown',
    body: '',
  };

  return {
    file,
    cardFiles: [{ path: `cards/${card.id}.md`, text: serializeCardFile(card) }],
  };
}
