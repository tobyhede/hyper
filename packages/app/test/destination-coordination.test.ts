import { describe, expect, it } from 'vitest';
import {
  encodeCompactUuid,
  spaceSnapshotSchema,
  uuidSchema,
  type ThingId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { productDestinationPath, resolveProductDestinationInSnapshot } from '@project/http';
import { destinationSync } from '../src/destination-coordination';
import type { NavigationAddress } from '../src/navigation';
import { createWorkingSpaceReader } from '../src/snapshot';

const uuid = (value: string): UUID => uuidSchema.parse(value);

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const THING_A = uuid('00000000-0000-4000-8000-000000000002');
const THING_B = uuid('00000000-0000-4000-8000-000000000003');
/** A Thing of the Space the Diagram does not hold, so no contextual URL names it. */
const THING_OFF_DIAGRAM = uuid('00000000-0000-4000-8000-000000000004');
const DIAGRAM = uuid('00000000-0000-4000-8000-000000000010');
const OPENING_GRAPH = uuid('00000000-0000-4000-8000-000000000020');
const OTHER_GRAPH = uuid('00000000-0000-4000-8000-000000000021');
/** A second Diagram, so a selection can move to a Diagram no location names. */
const OTHER_DIAGRAM = uuid('00000000-0000-4000-8000-000000000011');
const OTHER_DIAGRAM_GRAPH = uuid('00000000-0000-4000-8000-000000000022');

/**
 * One Diagram owning two Graphs, only one of which it opens on.
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
    defaultDiagram: DIAGRAM,
    diagrams: [
      {
        id: DIAGRAM,
        title: 'Diagram',
        kind: 'positioned',
        positions: {
          [THING_A]: { x: 0, y: 0, open: false },
          [THING_B]: { x: 320, y: 0, open: false },
        },
        graphs: [
          { id: OPENING_GRAPH, title: 'Opening', edges: [{ from: THING_A, to: THING_B }] },
          { id: OTHER_GRAPH, title: 'Other', edges: [{ from: THING_B, to: THING_A }] },
        ],
        activeGraph: OPENING_GRAPH,
      },
      {
        id: OTHER_DIAGRAM,
        title: 'Other Diagram',
        kind: 'positioned',
        positions: { [THING_A]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_DIAGRAM_GRAPH, title: 'Other Diagram Graph', edges: [] }],
      },
    ],
  },
  things: [
    { id: THING_A, document: { title: 'A', kind: 'markdown', body: '' } },
    { id: THING_B, document: { title: 'B', kind: 'markdown', body: '' } },
    { id: THING_OFF_DIAGRAM, document: { title: 'C', kind: 'markdown', body: '' } },
  ],
});

const space = createWorkingSpaceReader()(snapshot);

const overview = (activeGraphId: UUID | null = OPENING_GRAPH): NavigationAddress => ({
  selectedDiagramId: DIAGRAM,
  activeGraphId,
  presentingThingId: null,
});

const presenting = (thingId: ThingId, activeGraphId: UUID = OPENING_GRAPH): NavigationAddress => ({
  selectedDiagramId: DIAGRAM,
  activeGraphId,
  presentingThingId: thingId,
});

const view = `/spaces/${encodeCompactUuid(SPACE_ID)}/diagrams/${encodeCompactUuid(DIAGRAM)}`;

const sync = (
  pathname: string,
  address: NavigationAddress,
  synced: NavigationAddress,
  addressedThingId: ThingId | null = null,
) =>
  destinationSync({
    space,
    snapshot,
    pathname,
    position: { ...address, addressedThingId },
    synced,
  });

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

  it('does nothing at a canonical Thing location naming the addressed Thing', () => {
    expect(
      sync(
        productDestinationPath({ kind: 'thing', spaceId: SPACE_ID, thingId: THING_A }),
        overview(),
        overview(),
        THING_A,
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
        kind: 'diagram-graph',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM,
        graphId: OTHER_GRAPH,
      },
    });
  });

  it('pushes the presentation point a presenting address is at', () => {
    expect(sync(view, presenting(THING_A), overview())).toEqual({
      kind: 'push',
      destination: {
        kind: 'presentation',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM,
        graphId: OPENING_GRAPH,
        thingId: THING_A,
      },
    });
  });

  /**
   * The rule `adoptedRendererDestination` carried, generalised: a location that
   * is *more* specific than the address, in the same Diagram, is left as
   * specific as it was rather than widened.
   */
  it('keeps the Graph a location already names when a presentation ends', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(THING_A)}`;

    expect(sync(point, overview(), presenting(THING_A))).toEqual({
      kind: 'push',
      destination: {
        kind: 'diagram-graph',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM,
        graphId: OPENING_GRAPH,
      },
    });
  });

  /**
   * Leaving a presentation returns to the Graph, whatever Thing the location has
   * been naming.
   *
   * A canonical Thing URL leaves `addressedThingId` set, and nothing on the way
   * out of a presentation clears it. Answering a Thing destination there would
   * drop the Active Graph out of the address — which is exactly the
   * distinction the two Thing spellings exist to keep.
   */
  it('leaves a presentation for the Graph even while a Thing is still addressed', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(THING_A)}`;

    expect(sync(point, overview(), presenting(THING_A), THING_A)).toEqual({
      kind: 'push',
      destination: {
        kind: 'diagram-graph',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM,
        graphId: OPENING_GRAPH,
      },
    });
  });

  /**
   * The canonical Thing URL is the Thing's identity and names no Diagram; the
   * contextual one names both. Nothing here may rewrite the first into the
   * second — the reader holding a canonical link would find it silently
   * narrowed to the context they happened to be in.
   */
  it('does not rewrite a canonical Thing location into its contextual spelling', () => {
    const canonical = productDestinationPath({
      kind: 'thing',
      spaceId: SPACE_ID,
      thingId: THING_A,
    });

    expect(sync(canonical, overview(OTHER_GRAPH), overview(), THING_A)).toEqual({
      kind: 'push',
      destination: {
        kind: 'diagram-graph',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM,
        graphId: OTHER_GRAPH,
      },
    });
  });

  /**
   * Every destination this answers must be one the same Space can open again.
   *
   * A Thing the Diagram omits has a canonical URL and no contextual one: the
   * resolver refuses `/diagrams/<diagram>/things/<thing>` and the host answers 404.
   * Addressing that Thing *within* the Diagram would therefore write a
   * location that reloads into nothing.
   */
  it('answers no destination this Space refuses to resolve', () => {
    const point = `${view}/graphs/${encodeCompactUuid(OPENING_GRAPH)}/present/${encodeCompactUuid(THING_A)}`;

    const decision = sync(point, overview(), presenting(THING_A), THING_OFF_DIAGRAM);

    expect(decision.kind).not.toBe('none');
    if (decision.kind === 'none') return;
    expect(
      resolveProductDestinationInSnapshot(snapshot, productDestinationPath(decision.destination))
        .kind,
    ).toBe('resolved');
  });

  it('replaces, without a history entry, when the location still names a Thing the address has dropped', () => {
    // Choosing the current Diagram row again: Navigation republishes the same
    // address, and the Thing the location names is no longer addressed.
    expect(sync(`${view}/things/${encodeCompactUuid(THING_A)}`, overview(), overview())).toEqual({
      kind: 'replace',
      destination: { kind: 'diagram', spaceId: SPACE_ID, diagramId: DIAGRAM },
    });
  });

  it('replaces a location that no longer resolves once the address has settled elsewhere', () => {
    const missing = uuid('00000000-0000-4000-8000-0000000000aa');

    expect(sync(`${view}/graphs/${encodeCompactUuid(missing)}`, overview(), overview())).toEqual({
      kind: 'replace',
      destination: { kind: 'diagram', spaceId: SPACE_ID, diagramId: DIAGRAM },
    });
  });

  it('addresses the Diagram a selection has moved to', () => {
    expect(
      sync(
        view,
        {
          selectedDiagramId: OTHER_DIAGRAM,
          activeGraphId: OTHER_DIAGRAM_GRAPH,
          presentingThingId: null,
        },
        overview(),
      ),
    ).toEqual({
      kind: 'push',
      destination: { kind: 'diagram', spaceId: SPACE_ID, diagramId: OTHER_DIAGRAM },
    });
  });
});
