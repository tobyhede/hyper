import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GraphEdge, SpaceSnapshot, ThingDocument, ThingPlacement, UUID } from '@project/core';
import { loadSpaceSnapshot, Placement, SnapshotEdit } from '../src/index';
import { uuid } from './thing-files';

/**
 * The membership rules `SnapshotEdit` owns, held once as properties over
 * generated snapshots rather than restated per example (per the spec's "Tests:
 * replace, don't layer") — the same shape `placement.test.ts` already holds
 * `Placement`'s own round trip to.
 */

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const DIAGRAM_ID = uuid('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000003');

const idsArb = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 6 })
  .map((ids): UUID[] => ids.map(uuid));
const coordArb = fc.integer({ min: -1000, max: 1000 });
const coordsArb = fc.array(coordArb, { minLength: 12, maxLength: 12 });
const openSizeArb = fc.record({
  width: fc.integer({ min: 261, max: 900 }),
  height: fc.integer({ min: 147, max: 700 }),
});
const titleArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => s.trim().length > 0 && !s.includes('\n'));

const markdownDocument = (title: string): ThingDocument => ({ title, kind: 'markdown', body: '' });

/** A chain Edge through every consecutive pair, so an interior Thing carries incident Edges on both sides. */
const chainEdges = (ids: readonly UUID[]): GraphEdge[] => {
  const edges: GraphEdge[] = [];
  for (let i = 0; i + 1 < ids.length; i += 1) {
    const from = ids[i];
    const to = ids[i + 1];
    if (from !== undefined && to !== undefined) edges.push({ from, to });
  }
  return edges;
};

/** One Diagram owning one Graph over every generated Thing, at the given positions. */
const baseSnapshot = (
  ids: readonly UUID[],
  positions: Record<UUID, ThingPlacement>,
  edges: readonly GraphEdge[] = [],
): SpaceSnapshot => ({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Generated',
    defaultDiagram: DIAGRAM_ID,
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [...edges] }],
      },
    ],
  },
  things: ids.map((id, index) => ({ id, document: markdownDocument(`Thing ${index}`) })),
});

const closedPlacement = (ids: readonly UUID[], coords: readonly number[]): Placement =>
  Placement.fromEntries(
    ids.map((id, i) => [
      id,
      { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false as const },
    ]),
  );

describe('SnapshotEdit.deleteFromSpace properties', () => {
  it('leaves a snapshot intake accepts after deleting any un-aliased Thing', () => {
    fc.assert(
      fc.property(idsArb, coordsArb, fc.nat({ max: 8 }), (ids, coords, subjectSeed) => {
        const subject = ids[subjectSeed % ids.length];
        if (subject === undefined) return;
        const positions = Placement.toPositions(closedPlacement(ids, coords));
        const snapshot = baseSnapshot(ids, positions, chainEdges(ids));

        const outcome = SnapshotEdit.deleteFromSpace(snapshot, subject);

        expect(outcome.kind).toBe('completed');
        if (outcome.kind !== 'completed') return;
        expect(loadSpaceSnapshot(outcome.snapshot).ok).toBe(true);
      }),
    );
  });

  it('leaves every other Thing where a delete before Open would have', () => {
    // The property Open and Delete rest on (ADR 0084): Delete reclaims exactly
    // the room an Open Thing holds, so the Things that were never opened land
    // in the same place whether or not the deleted Thing was ever Open —
    // `deleteFromSpace`'s own use of `Placement.reclaim` is what makes this
    // hold, and it is exactly the call the registry's old `removeSpaceThing`
    // skipped.
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        openSizeArb,
        (ids, coords, subjectSeed, openSize) => {
          const subject = ids[subjectSeed % ids.length];
          if (subject === undefined) return;
          const closed = closedPlacement(ids, coords);
          const subjectAt = closed.get(subject);
          if (subjectAt === undefined) return;

          const before = baseSnapshot(ids, Placement.toPositions(closed));

          const displaced = Placement.displace(closed, subject, Placement.growth(openSize));
          const opened = Placement.place(displaced, subject, {
            ...subjectAt,
            open: true,
            openSize,
          });
          const after = baseSnapshot(ids, Placement.toPositions(opened));

          const deletedBefore = SnapshotEdit.deleteFromSpace(before, subject);
          const deletedAfter = SnapshotEdit.deleteFromSpace(after, subject);
          if (deletedBefore.kind !== 'completed' || deletedAfter.kind !== 'completed') {
            throw new Error('Expected both deletions to complete');
          }

          const others = ids.filter((id) => id !== subject);
          const positionsOf = (snapshot: SpaceSnapshot) => {
            const diagram = snapshot.document.diagrams?.[0];
            return others.map((id) => diagram?.positions[id]);
          };
          expect(positionsOf(deletedAfter.snapshot)).toEqual(positionsOf(deletedBefore.snapshot));
        },
      ),
    );
  });

  it('always refuses to delete a Thing an Alias in the Space still targets', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.uuid().map(uuid),
        titleArb,
        (ids, coords, subjectSeed, aliasId, aliasTitle) => {
          fc.pre(!ids.includes(aliasId));
          const subject = ids[subjectSeed % ids.length];
          if (subject === undefined) return;
          const positions = Placement.toPositions(closedPlacement(ids, coords));
          const base = baseSnapshot(ids, positions);
          const snapshot: SpaceSnapshot = {
            ...base,
            things: [
              ...base.things,
              { id: aliasId, document: { title: aliasTitle, kind: 'alias', target: subject } },
            ],
          };

          const outcome = SnapshotEdit.deleteFromSpace(snapshot, subject);

          expect(outcome).toEqual({
            kind: 'refused',
            refusal: { code: 'thing-has-aliases', aliasTitles: [aliasTitle] },
          });
        },
      ),
    );
  });
});

describe('SnapshotEdit.createInDiagram properties', () => {
  it('refuses creation into a Diagram the snapshot does not name, and changes nothing', () => {
    // A coordinated create or link must not silently add an unpositioned
    // Thing when its containing Diagram is gone by the time the Edit lands.
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.uuid().map(uuid),
        fc.uuid().map(uuid),
        (ids, coords, newThingId, missingDiagramId) => {
          fc.pre(!ids.includes(newThingId));
          fc.pre(missingDiagramId !== DIAGRAM_ID);
          const positions = Placement.toPositions(closedPlacement(ids, coords));
          const snapshot = baseSnapshot(ids, positions);

          const outcome = SnapshotEdit.createInDiagram(
            snapshot,
            missingDiagramId,
            newThingId,
            markdownDocument('New'),
            { x: 0, y: 0 },
            'avoidingOverlap',
          );

          expect(outcome).toEqual({ kind: 'refused', refusal: { code: 'diagram-not-found' } });
        },
      ),
    );
  });

  it('never lands avoidingOverlap on a point another Thing already occupies', () => {
    fc.assert(
      fc.property(idsArb, coordsArb, fc.uuid().map(uuid), (ids, coords, newThingId) => {
        fc.pre(!ids.includes(newThingId));
        const positions = Placement.toPositions(closedPlacement(ids, coords));
        const snapshot = baseSnapshot(ids, positions);
        const first = ids[0];
        if (first === undefined) return;
        const anchor = positions[first];
        if (anchor === undefined) return;

        const outcome = SnapshotEdit.createInDiagram(
          snapshot,
          DIAGRAM_ID,
          newThingId,
          markdownDocument('New'),
          anchor,
          'avoidingOverlap',
        );

        expect(outcome.kind).toBe('completed');
        if (outcome.kind !== 'completed') return;
        const newAt = outcome.snapshot.document.diagrams?.[0]?.positions[newThingId];
        expect(newAt).toBeDefined();
        if (newAt === undefined) return;
        const collides = ids.some((id) => {
          const at = positions[id];
          if (at === undefined) return false;
          return at.x === newAt.x && at.y === newAt.y;
        });
        expect(collides).toBe(false);
      }),
    );
  });
});
