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

/** The Space title an unnamed new Space takes until an Edit renames it. */
const NEW_SPACE_TITLE = 'New space';

/** Inputs to the one normal-Space initializer used by every provisioning path. */
export interface InitializeSpaceOptions {
  /** Names the **Space**; its first Card takes the neutral `Card 1` instead. */
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
 *
 * The supplied title names the **Space** and nothing else. Its first Card takes
 * the same neutral `Card 1` {@link newSpace} mints, because the two are separate
 * things from the moment they exist: creating a Space Card seeds the Card, the
 * Space and that first Card from one typed title, and titling the content after
 * the Space it lives in only reads as deliberate until the first rename makes
 * the pair disagree.
 */
export function initializeSpace({ title, newId }: InitializeSpaceOptions): NewSpace {
  const spaceId = newId();
  const cardId = newId();
  const layoutId = newId();
  const graphId = newId();
  const card: Card = { id: cardId, title: FIRST_CARD_TITLE, kind: 'markdown', body: '' };

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
      defaultLayout: layoutId,
    },
    cardFiles: [{ path: `cards/${card.id}.md`, text: serializeCardFile(card) }],
  };
}

export function newSpace(): NewSpace {
  return initializeSpace({ title: NEW_SPACE_TITLE, newId: newUuid });
}
