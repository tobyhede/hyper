import { newUuid, SPACE_FILE_VERSION, type Card, type SpaceFile, type UUID } from '@project/core';
import { serializeCardFile, type CardFile } from './card-file';

/**
 * A new Space: one Card in one complete default Layout (ADRs 0018 and 0080).
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
  /**
   * The composition-owned identity source. A complete new Space needs four:
   * the Space, its first Card, its default Layout and that Layout's Graph.
   */
  readonly newId: () => UUID;
}

/**
 * Initialize a normal authored Space through the same on-disk intake as every
 * other Space.
 *
 * A normal Space begins complete: one Markdown Card in its default authored
 * Layout, with one empty Active Graph. Meta bootstrap, ordinary startup and
 * Space Card creation share this shape.
 */
export function initializeSpace({ title, newId }: InitializeSpaceOptions): NewSpace {
  const spaceId = newId();
  const cardId = newId();
  const layoutId = newId();
  const graphId = newId();
  const card: Card = { id: cardId, title, kind: 'markdown', body: '' };

  return {
    file: {
      version: SPACE_FILE_VERSION,
      id: spaceId,
      title,
      layouts: [
        {
          id: layoutId,
          title: 'Layout 1',
          kind: 'positioned',
          positions: { [cardId]: { x: 0, y: 0, open: false } },
          graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
          activeGraph: graphId,
        },
      ],
      defaultRenderer: layoutId,
    },
    cardFiles: [{ path: `cards/${card.id}.md`, text: serializeCardFile(card) }],
  };
}

export function newSpace(): NewSpace {
  const created = initializeSpace({ title: FIRST_CARD_TITLE, newId: newUuid });
  return { ...created, file: { ...created.file, title: 'New space' } };
}
