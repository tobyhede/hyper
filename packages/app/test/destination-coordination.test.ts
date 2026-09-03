import { describe, expect, it } from 'vitest';
import {
  FLOW_SPACE_VIEW_ID,
  encodeCompactUuid,
  spaceSnapshotSchema,
  uuidSchema,
  type CardId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { productDestinationPath, resolveProductDestinationInSnapshot } from '@project/http';
import { destinationSync } from '../src/destination-coordination';
import type { NavigationAddress } from '../src/navigation';
import { createRendererResolver } from '../src/renderer';
import { createWorkingSpaceReader } from '../src/snapshot';

const uuid = (value: string): UUID => uuidSchema.parse(value);

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const CARD_A = uuid('00000000-0000-4000-8000-000000000002');
const CARD_B = uuid('00000000-0000-4000-8000-000000000003');
/** A Card of the Space the Layout does not hold, so no contextual URL names it. */
const CARD_OFF_LAYOUT = uuid('00000000-0000-4000-8000-000000000004');
const LAYOUT = uuid('00000000-0000-4000-8000-000000000010');
const OPENING_GRAPH = uuid('00000000-0000-4000-8000-000000000020');
const OTHER_GRAPH = uuid('00000000-0000-4000-8000-000000000021');

/**
 * One Layout owning two Graphs, only one of which it opens on.
 *
 * Two, because the whole question this module answers is whether a location
 * already opens an address, and a Space whose only Graph is the one every
 * location opens on cannot tell "already open" from "cannot say".
 */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    defaultRenderer: LAYOUT,
    layouts: [
      {
        id: LAYOUT,
        title: 'Layout',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 0, y: 0, open: false },
          [CARD_B]: { x: 320, y: 0, open: false },
        },
        graphs: [
          { id: OPENING_GRAPH, title: 'Opening', edges: [{ from: CARD_A, to: CARD_B }] },
          { id: OTHER_GRAPH, title: 'Other', edges: [{ from: CARD_B, to: CARD_A }] },
        ],
        activeGraph: OPENING_GRAPH,
      },
    ],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: '' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: '' } },
    { id: CARD_OFF_LAYOUT, document: { title: 'C', kind: 'markdown', body: '' } },
  ],
});

const space = createWorkingSpaceReader()(snapshot);
const resolveRenderer = createRendererResolver({
  newGraphId: () => uuid('00000000-0000-4000-8000-0000000000ff'),
});

const overview = (activeGraphId: UUID | null = OPENING_GRAPH): NavigationAddress => ({
  selectedRenderer: LAYOUT,
  activeGraphId,
  presentingCardId: null,
});

const presenting = (cardId: CardId, activeGraphId: UUID = OPENING_GRAPH): NavigationAddress => ({
  selectedRenderer: LAYOUT,
  activeGraphId,
  presentingCardId: cardId,
});

const view = `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT)}`;

const sync = (
  pathname: string,
  address: NavigationAddress,
  synced: NavigationAddress,
  addressedCardId: CardId | null = null,
) =>
  destinationSync({ space, snapshot, pathname, resolveRenderer, address, addressedCardId, synced });

describe('what the browser should do about an address', () => {
  it('does nothing when the location already opens the address, however it got there', () => {
    // Back to a Graph destination: the address has just moved to what the
    // location names, so a decision that only compared addresses would push a
    // second entry over the one the browser navigated to.
    expect(
      sync(`${view}/graphs/${encodeCompactUuid(OTHER_GRAPH)}`, overview(OTHER_GRAPH), overview()),
    ).toEqual({ kind: 'none' });
  });

  it('does nothing at a Space location that opens the default renderer', () => {
    expect(sync(`/spaces/${encodeCompactUuid(SPACE_ID)}`, overview(), overview())).toEqual({
      kind: 'none',
    });
  });

  it('does nothing at a canonical Card location naming the addressed Card', () => {
    expect(
      sync(
        productDestinationPath({ kind: 'card', spaceId: SPACE_ID, cardId: CARD_A }),
        overview(),
        overview(),
        CARD_A,
      ),
    ).toEqual({ kind: 'none' });
  });

  it('leaves a location outside product addressing alone until the reader moves', () => {
    expect(sync('/', overview(), overview())).toEqual({ kind: 'none' });
  });

  it('pushes when the address moved away from the location', () => {
    expect(sync(view, overview(OTHER_GRAPH), overview())).toEqual({
      kind: 'push',
      destination: {
        kind: 'space-view-graph',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT,
        graphId: OTHER_GRAPH,
      },
    });
  });

  it('pushes the presentation point a presenting address is at', () => {
    expect(sync(view, presenting(CARD_A), overview())).toEqual({
      kind: 'push',
      destination: {
        kind: 'presentation',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT,
        graphId: OPENING_GRAPH,
        cardId: CARD_A,
      },
    });
  });

  /**
   * The rule `adoptedRendererDestination` carried, generalised: a location that
   * is *more* specific than the address, in the same Space View, is left as
   * specific as it was rather than widened.
   */
  it('keeps the Graph a location already names when a presentation ends', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(CARD_A)}`;

    expect(sync(point, overview(), presenting(CARD_A))).toEqual({
      kind: 'push',
      destination: {
        kind: 'space-view-graph',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT,
        graphId: OPENING_GRAPH,
      },
    });
  });

  /**
   * Leaving a presentation returns to the Graph, whatever Card the location has
   * been naming.
   *
   * A canonical Card URL leaves `addressedCardId` set, and nothing on the way
   * out of a presentation clears it. Answering a Card destination there would
   * drop the Active Graph out of the address — which is exactly the
   * distinction the two Card spellings exist to keep.
   */
  it('leaves a presentation for the Graph even while a Card is still addressed', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(CARD_A)}`;

    expect(sync(point, overview(), presenting(CARD_A), CARD_A)).toEqual({
      kind: 'push',
      destination: {
        kind: 'space-view-graph',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT,
        graphId: OPENING_GRAPH,
      },
    });
  });

  /**
   * The canonical Card URL is the Card's identity and names no Space View; the
   * contextual one names both. Nothing here may rewrite the first into the
   * second — the reader holding a canonical link would find it silently
   * narrowed to the context they happened to be in.
   */
  it('does not rewrite a canonical Card location into its contextual spelling', () => {
    const canonical = productDestinationPath({ kind: 'card', spaceId: SPACE_ID, cardId: CARD_A });

    expect(sync(canonical, overview(OTHER_GRAPH), overview(), CARD_A)).toEqual({
      kind: 'push',
      destination: {
        kind: 'space-view-graph',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT,
        graphId: OTHER_GRAPH,
      },
    });
  });

  /**
   * Every destination this answers must be one the same Space can open again.
   *
   * A Card the Layout omits has a canonical URL and no contextual one: the
   * resolver refuses `/views/<layout>/cards/<card>` and the host answers 404.
   * Addressing that Card *within* the Space View would therefore write a
   * location that reloads into nothing.
   */
  it('answers no destination this Space refuses to resolve', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(CARD_A)}`;

    const decision = sync(point, overview(), presenting(CARD_A), CARD_OFF_LAYOUT);

    expect(decision.kind).not.toBe('none');
    if (decision.kind === 'none') return;
    expect(
      resolveProductDestinationInSnapshot(snapshot, productDestinationPath(decision.destination))
        .kind,
    ).toBe('resolved');
  });

  it('replaces, without a history entry, when the location still names a Card the address has dropped', () => {
    // Choosing the current Space View row again: Navigation republishes the same
    // address, and the Card the location names is no longer addressed.
    expect(sync(`${view}/cards/${encodeCompactUuid(CARD_A)}`, overview(), overview())).toEqual({
      kind: 'replace',
      destination: { kind: 'space-view', spaceId: SPACE_ID, spaceViewId: LAYOUT },
    });
  });

  it('replaces a location that no longer resolves once the address has settled elsewhere', () => {
    const missing = uuid('00000000-0000-4000-8000-0000000000aa');

    expect(sync(`${view}/graphs/${encodeCompactUuid(missing)}`, overview(), overview())).toEqual({
      kind: 'replace',
      destination: { kind: 'space-view', spaceId: SPACE_ID, spaceViewId: LAYOUT },
    });
  });

  it('addresses the Space View a Computed View selection opens on', () => {
    expect(
      sync(
        view,
        {
          selectedRenderer: FLOW_SPACE_VIEW_ID,
          activeGraphId: OPENING_GRAPH,
          presentingCardId: null,
        },
        overview(),
      ),
    ).toEqual({
      kind: 'push',
      destination: { kind: 'space-view', spaceId: SPACE_ID, spaceViewId: FLOW_SPACE_VIEW_ID },
    });
  });
});
