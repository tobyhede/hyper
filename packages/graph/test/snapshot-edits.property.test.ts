import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COLLAPSED_RESOURCE_SIZE,
  DEFAULT_OPEN_SIZE,
  type GraphEdge,
  type SpaceSnapshot,
  type ResourceDocument,
  type ResourcePlacement,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement, SnapshotEdit, type SnapshotEditOutcome } from '../src/index';
import { uuid } from './resource-files';

/**
 * The membership rules `SnapshotEdit` owns, held once as properties over
 * generated snapshots rather than restated per example (per the spec's "Tests:
 * replace, don't layer") — the same shape `placement.test.ts` already holds
 * `Placement`'s own round trip to.
 */

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const MAP_ID = uuid('00000000-0000-4000-8000-000000000002');
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

const markdownDocument = (title: string): ResourceDocument => ({
  title,
  kind: 'markdown',
  body: '',
});

/** A chain Edge through every consecutive pair, so an interior Resource carries incident Edges on both sides. */
const chainEdges = (ids: readonly UUID[]): GraphEdge[] => {
  const edges: GraphEdge[] = [];
  for (let i = 0; i + 1 < ids.length; i += 1) {
    const from = ids[i];
    const to = ids[i + 1];
    if (from !== undefined && to !== undefined) edges.push({ from, to });
  }
  return edges;
};

/** One Map owning one Graph over every generated Resource, at the given positions. */
const baseSnapshot = (
  ids: readonly UUID[],
  positions: Record<UUID, ResourcePlacement>,
  edges: readonly GraphEdge[] = [],
): SpaceSnapshot => ({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Generated',
    defaultMap: MAP_ID,
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [...edges] }],
      },
    ],
  },
  resources: ids.map((id, index) => ({ id, document: markdownDocument(`Resource ${index}`) })),
});

const closedPlacement = (ids: readonly UUID[], coords: readonly number[]): Placement =>
  Placement.fromEntries(
    ids.map((id, i) => [
      id,
      { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false as const },
    ]),
  );

describe('SnapshotEdit.deleteFromSpace properties', () => {
  it('leaves a snapshot intake accepts after deleting any un-referenced Resource', () => {
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

  it('leaves every other Resource where a delete before Open would have', () => {
    // The property Open and Delete rest on (ADR 0084): Delete reclaims exactly
    // the room an Open Resource holds, so the Resources that were never opened land
    // in the same place whether or not the deleted Resource was ever Open —
    // `deleteFromSpace`'s own use of `Placement.reclaim` is what makes this
    // hold, and it is exactly the call the registry's old `removeSpaceResource`
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
            const map = snapshot.document.maps?.[0];
            return others.map((id) => map?.positions[id]);
          };
          expect(positionsOf(deletedAfter.snapshot)).toEqual(positionsOf(deletedBefore.snapshot));
        },
      ),
    );
  });

  it('always refuses to delete a Resource a Reference Resource in the Space still targets', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.uuid().map(uuid),
        titleArb,
        (ids, coords, subjectSeed, referenceId, referenceTitle) => {
          fc.pre(!ids.includes(referenceId));
          const subject = ids[subjectSeed % ids.length];
          if (subject === undefined) return;
          const positions = Placement.toPositions(closedPlacement(ids, coords));
          const base = baseSnapshot(ids, positions);
          const snapshot: SpaceSnapshot = {
            ...base,
            resources: [
              ...base.resources,
              {
                id: referenceId,
                document: { title: referenceTitle, kind: 'reference', target: subject },
              },
            ],
          };

          const outcome = SnapshotEdit.deleteFromSpace(snapshot, subject);

          expect(outcome).toEqual({
            kind: 'refused',
            refusal: { code: 'resource-has-references', referenceTitles: [referenceTitle] },
          });
        },
      ),
    );
  });
});

describe('SnapshotEdit.createInMap properties', () => {
  const referenceTo = (target: UUID): ResourceDocument => ({
    title: 'Reference',
    kind: 'reference',
    target,
  });

  it('refuses a Reference Resource whose Target is missing or is itself a Reference Resource', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.uuid().map(uuid),
        fc.uuid().map(uuid),
        fc.constantFrom<'exact' | 'avoidingOverlap'>('exact', 'avoidingOverlap'),
        (ids, coords, targetSeed, newResourceId, missing, mode) => {
          fc.pre(!ids.includes(newResourceId) && !ids.includes(missing));
          fc.pre(newResourceId !== missing);
          const target = ids[targetSeed % ids.length];
          if (target === undefined) return;
          const base = baseSnapshot(ids, Placement.toPositions(closedPlacement(ids, coords)));
          // One existing Resource turned into a Reference Resource, so it is a
          // Target that owns no content of its own.
          const referencing: SpaceSnapshot = {
            ...base,
            resources: base.resources.map((resource) =>
              resource.id === target
                ? { id: target, document: referenceTo(ids.find((id) => id !== target) ?? target) }
                : resource,
            ),
          };
          const at = { x: 0, y: 0 };

          expect(
            SnapshotEdit.createInMap(base, MAP_ID, newResourceId, referenceTo(missing), at, mode),
          ).toEqual({
            kind: 'refused',
            refusal: { code: 'reference-target-not-found', targetId: missing },
          });
          expect(
            SnapshotEdit.createInMap(
              referencing,
              MAP_ID,
              newResourceId,
              referenceTo(target),
              at,
              mode,
            ),
          ).toEqual({
            kind: 'refused',
            refusal: { code: 'reference-target-must-own-content', targetId: target },
          });
        },
      ),
    );
  });

  it('creates a Reference Resource to a Target that owns content, which intake accepts', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.uuid().map(uuid),
        fc.boolean(),
        (ids, coords, targetSeed, newResourceId, targetIsSpace) => {
          fc.pre(!ids.includes(newResourceId));
          const target = ids[targetSeed % ids.length];
          if (target === undefined) return;
          const base = baseSnapshot(ids, Placement.toPositions(closedPlacement(ids, coords)));
          // A Space Resource owns content too: it draws its target's Map (ADR 0070).
          const snapshot: SpaceSnapshot = targetIsSpace
            ? {
                ...base,
                resources: base.resources.map((resource) =>
                  resource.id === target
                    ? {
                        id: target,
                        document: {
                          title: 'Nested',
                          kind: 'space',
                          spaceId: uuid('00000000-0000-4000-8000-0000000000aa'),
                          map: MAP_ID,
                          graph: GRAPH_ID,
                        },
                      }
                    : resource,
                ),
              }
            : base;

          const outcome = SnapshotEdit.createInMap(
            snapshot,
            MAP_ID,
            newResourceId,
            referenceTo(target),
            { x: 0, y: 0 },
            'avoidingOverlap',
          );

          expect(outcome.kind).toBe('completed');
          if (outcome.kind !== 'completed') return;
          expect(loadSpaceSnapshot(outcome.snapshot).ok).toBe(true);
          expect(outcome.snapshot.resources.at(-1)).toEqual({
            id: newResourceId,
            document: referenceTo(target),
          });
        },
      ),
    );
  });

  it('keeps an exact point as aimed, even one another Resource occupies', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.uuid().map(uuid),
        (ids, coords, anchorSeed, newResourceId) => {
          fc.pre(!ids.includes(newResourceId));
          const positions = Placement.toPositions(closedPlacement(ids, coords));
          const neighbour = ids[anchorSeed % ids.length];
          const anchor = neighbour === undefined ? undefined : positions[neighbour];
          if (anchor === undefined) return;

          const outcome = SnapshotEdit.createInMap(
            baseSnapshot(ids, positions),
            MAP_ID,
            newResourceId,
            markdownDocument('New'),
            anchor,
            'exact',
          );

          expect(outcome.kind).toBe('completed');
          if (outcome.kind !== 'completed') return;
          expect(loadSpaceSnapshot(outcome.snapshot).ok).toBe(true);
          expect(outcome.snapshot.document.maps?.[0]?.positions[newResourceId]).toEqual({
            x: anchor.x,
            y: anchor.y,
            open: false,
          });
        },
      ),
    );
  });

  it('refuses creation into a Map the snapshot does not name, and changes nothing', () => {
    // A coordinated create or link must not silently add an unpositioned
    // Resource when its containing Map is gone by the time the Edit lands.
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.uuid().map(uuid),
        fc.uuid().map(uuid),
        (ids, coords, newResourceId, missingMapId) => {
          fc.pre(!ids.includes(newResourceId));
          fc.pre(missingMapId !== MAP_ID);
          const positions = Placement.toPositions(closedPlacement(ids, coords));
          const snapshot = baseSnapshot(ids, positions);

          const outcome = SnapshotEdit.createInMap(
            snapshot,
            missingMapId,
            newResourceId,
            markdownDocument('New'),
            { x: 0, y: 0 },
            'avoidingOverlap',
          );

          expect(outcome).toEqual({ kind: 'refused', refusal: { code: 'map-not-found' } });
        },
      ),
    );
  });

  it('never lands avoidingOverlap on a point another Resource already occupies', () => {
    fc.assert(
      fc.property(idsArb, coordsArb, fc.uuid().map(uuid), (ids, coords, newResourceId) => {
        fc.pre(!ids.includes(newResourceId));
        const positions = Placement.toPositions(closedPlacement(ids, coords));
        const snapshot = baseSnapshot(ids, positions);
        const first = ids[0];
        if (first === undefined) return;
        const anchor = positions[first];
        if (anchor === undefined) return;

        const outcome = SnapshotEdit.createInMap(
          snapshot,
          MAP_ID,
          newResourceId,
          markdownDocument('New'),
          anchor,
          'avoidingOverlap',
        );

        expect(outcome.kind).toBe('completed');
        if (outcome.kind !== 'completed') return;
        const newAt = outcome.snapshot.document.maps?.[0]?.positions[newResourceId];
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

/**
 * Open, Close and Resize (ADR 0084, ADR 0093, ADR 0066), over one Map of five
 * Resources.
 *
 * Moved here from Authoring's own `displacement.property.test.ts` when the
 * rules did: the transform `Placement.displace` is already held to its round
 * trip by `placement.test.ts`, and what these hold is the whole of what an Open,
 * a Close and a Resize choose to apply — which growth each reads off which
 * entry, in which order, and what they write back into the Map. The transform
 * can be an exact involution and the Edits still drift, if an Open reads the
 * default Open Size while the Close reads the remembered one.
 */
describe('SnapshotEdit.open, close and resize properties', () => {
  const RESOURCE_IDS = [
    uuid('00000000-0000-4000-8000-000000000012'),
    uuid('00000000-0000-4000-8000-000000000013'),
    uuid('00000000-0000-4000-8000-000000000017'),
    uuid('00000000-0000-4000-8000-000000000018'),
    uuid('00000000-0000-4000-8000-000000000019'),
  ] as const;

  /**
   * An explicit `seed` and `numRuns`, so the case distribution the coverage
   * floor below is measured against is a fixed fact of the suite rather than a
   * roll of the dice: a floor that holds once holds on every machine.
   */
  const SEED = 84;
  const RUNS = 200;
  const COVERAGE_FLOOR = 40;

  type Extent = { readonly width: number; readonly height: number };

  type GeneratedEntry = {
    readonly x: number;
    readonly y: number;
    readonly open: boolean;
    readonly openSize: Extent | undefined;
  };

  /**
   * A handful of values rather than a wide range, because what decides whether
   * a Resource moves is whether it starts **at or past** the subject's collapsed
   * edge (ADR 0093) — the case a wide range essentially never generates. Their
   * differences land exactly on both collapsed edges (260 and 146), one unit
   * short of each, and well inside and well past them.
   */
  const coordinateArb = fc.constantFrom(-260, -146, 0, 1, 114, 146, 260, 261, 520);

  /** An Open Size the schema accepts: never below the collapsed rect on either axis. */
  const sizeArb = fc.record({
    width: fc.integer({
      min: COLLAPSED_RESOURCE_SIZE.width,
      max: COLLAPSED_RESOURCE_SIZE.width + 600,
    }),
    height: fc.integer({
      min: COLLAPSED_RESOURCE_SIZE.height,
      max: COLLAPSED_RESOURCE_SIZE.height + 600,
    }),
  });

  /** A resize that is never the collapsed rect exactly, which is a Close rather than a Resize. */
  const resizeArb = sizeArb.filter(
    (size) =>
      size.width !== COLLAPSED_RESOURCE_SIZE.width ||
      size.height !== COLLAPSED_RESOURCE_SIZE.height,
  );

  const entriesArb = fc.array(
    fc.record({
      x: coordinateArb,
      y: coordinateArb,
      open: fc.boolean(),
      openSize: fc.option(sizeArb, { nil: undefined }),
    }),
    { minLength: RESOURCE_IDS.length, maxLength: RESOURCE_IDS.length },
  );

  const subjectArb = fc.nat({ max: RESOURCE_IDS.length - 1 });

  const placementOf = (entry: GeneratedEntry): ResourcePlacement => {
    if (entry.open) {
      return { x: entry.x, y: entry.y, open: true, openSize: entry.openSize ?? DEFAULT_OPEN_SIZE };
    }
    return entry.openSize === undefined
      ? { x: entry.x, y: entry.y, open: false }
      : { x: entry.x, y: entry.y, open: false, openSize: entry.openSize };
  };

  const with_ = (
    entries: readonly GeneratedEntry[],
    at: number,
    change: Partial<GeneratedEntry>,
  ): readonly GeneratedEntry[] =>
    entries.map((entry, index) => (index === at ? { ...entry, ...change } : entry));

  const snapshotOf = (entries: readonly GeneratedEntry[]): SpaceSnapshot => {
    const positions: Record<UUID, ResourcePlacement> = {};
    RESOURCE_IDS.forEach((resourceId, index) => {
      const entry = entries[index];
      if (entry !== undefined) positions[resourceId] = placementOf(entry);
    });
    return baseSnapshot(RESOURCE_IDS, positions);
  };

  /** A completed outcome's snapshot, which intake must accept. */
  const completed = (outcome: SnapshotEditOutcome): SpaceSnapshot => {
    if (outcome.kind !== 'completed') throw new Error(`Expected completed, got ${outcome.kind}`);
    expect(loadSpaceSnapshot(outcome.snapshot).ok).toBe(true);
    return outcome.snapshot;
  };

  /** A completed snapshot, or the one given back when the Edit changed nothing. */
  const settled = (snapshot: SpaceSnapshot, outcome: SnapshotEditOutcome): SpaceSnapshot =>
    outcome.kind === 'unchanged' ? snapshot : completed(outcome);

  const positionsOf = (snapshot: SpaceSnapshot) => snapshot.document.maps?.[0]?.positions ?? {};

  /** Every origin the Map authors, so a whole Map can be compared at once. */
  const originsOf = (snapshot: SpaceSnapshot) =>
    Object.fromEntries(
      Object.entries(positionsOf(snapshot)).map(([resourceId, at]) => [
        resourceId,
        at === undefined ? undefined : [at.x, at.y],
      ]),
    );

  /**
   * The subject Closed as setup, before a round trip is measured.
   *
   * `displace` is an involution for a **nonnegative** growth applied first,
   * which is the Open; closing first applies the negation first, which ADR 0084
   * states as an asymmetry rather than clamps, and which the product never
   * reaches because a Close only ever negates a growth an Open applied.
   */
  const closedFirst = (snapshot: SpaceSnapshot, subjectId: UUID): SpaceSnapshot =>
    settled(snapshot, SnapshotEdit.close(snapshot, MAP_ID, subjectId));

  /**
   * What each generated case had in it, so a property cannot pass vacuously: a
   * case counts toward a relation when some non-subject Resource stands in it to
   * the subject's collapsed rect.
   */
  const createCoverage = () => {
    const counts = { x: 0, y: 0, both: 0, neither: 0, open: 0, closed: 0 };
    const record = (entries: readonly GeneratedEntry[], subjectIndex: number): void => {
      const subject = entries[subjectIndex];
      if (subject === undefined) return;
      const seen = { x: false, y: false, both: false, neither: false };
      entries.forEach((entry, index) => {
        if (index === subjectIndex) return;
        const clearX = entry.x >= subject.x + COLLAPSED_RESOURCE_SIZE.width;
        const clearY = entry.y >= subject.y + COLLAPSED_RESOURCE_SIZE.height;
        if (clearX && clearY) seen.both = true;
        else if (clearX) seen.x = true;
        else if (clearY) seen.y = true;
        else seen.neither = true;
      });
      for (const relation of ['x', 'y', 'both', 'neither'] as const) {
        if (seen[relation]) counts[relation] += 1;
      }
      if (subject.open) counts.open += 1;
      else counts.closed += 1;
    };
    const expectEveryCaseGenerated = (): void => {
      for (const count of Object.values(counts)) {
        expect(count).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
      }
    };
    return { record, expectEveryCaseGenerated };
  };

  it('round-trips every position through Open then Close, keeping the Open Size', () => {
    const coverage = createCoverage();
    fc.assert(
      fc.property(entriesArb, subjectArb, sizeArb, (generated, subjectIndex, openSize) => {
        const entries = with_(generated, subjectIndex, { openSize });
        const subjectId = RESOURCE_IDS[subjectIndex];
        if (subjectId === undefined) return;
        coverage.record(entries, subjectIndex);

        const start = closedFirst(snapshotOf(entries), subjectId);
        const opened = completed(SnapshotEdit.open(start, MAP_ID, subjectId));
        const closed = completed(SnapshotEdit.close(opened, MAP_ID, subjectId));

        expect(originsOf(closed)).toEqual(originsOf(start));
        expect(positionsOf(closed)[subjectId]).toEqual({
          ...positionsOf(start)[subjectId],
          open: false,
          openSize,
        });
      }),
      { seed: SEED, numRuns: RUNS },
    );
    coverage.expectEveryCaseGenerated();
  });

  it('round-trips every position through Open, any number of Resizes, then Close', () => {
    // Resize applies the *difference* between two growths, so a Map comes back
    // only if every difference sums to the growth the Close then reclaims.
    // Generating shrinks as well as grows is what makes that a claim about the
    // arithmetic rather than about monotone sequences.
    const coverage = createCoverage();
    fc.assert(
      fc.property(
        entriesArb,
        subjectArb,
        sizeArb,
        fc.array(resizeArb, { maxLength: 5 }),
        (generated, subjectIndex, openSize, resizes) => {
          const entries = with_(generated, subjectIndex, { openSize });
          const subjectId = RESOURCE_IDS[subjectIndex];
          if (subjectId === undefined) return;
          coverage.record(entries, subjectIndex);

          const start = closedFirst(snapshotOf(entries), subjectId);
          let current = completed(SnapshotEdit.open(start, MAP_ID, subjectId));
          for (const size of resizes) {
            current = settled(current, SnapshotEdit.resize(current, MAP_ID, subjectId, size));
          }
          const closed = completed(SnapshotEdit.close(current, MAP_ID, subjectId));

          expect(originsOf(closed)).toEqual(originsOf(start));
          // The Open Size kept is the last one the Resource was Open at (ADR 0066).
          expect(positionsOf(closed)[subjectId]?.openSize).toEqual(resizes.at(-1) ?? openSize);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
    coverage.expectEveryCaseGenerated();
  });

  it('restores every position through a Resize to another size and back', () => {
    fc.assert(
      fc.property(
        entriesArb,
        subjectArb,
        resizeArb,
        resizeArb,
        (generated, subjectIndex, first, second) => {
          const subjectId = RESOURCE_IDS[subjectIndex];
          if (subjectId === undefined) return;
          const entries = with_(generated, subjectIndex, { openSize: first });

          const start = closedFirst(snapshotOf(entries), subjectId);
          const opened = completed(SnapshotEdit.open(start, MAP_ID, subjectId));
          const there = settled(opened, SnapshotEdit.resize(opened, MAP_ID, subjectId, second));
          const back = settled(there, SnapshotEdit.resize(there, MAP_ID, subjectId, first));

          expect(positionsOf(back)).toEqual(positionsOf(opened));
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('closes on a Resize to exactly the Closed Size, reclaiming the size it was Open at', () => {
    // The magnetic Close (ADR 0066) arrives as a resize proposal at exactly
    // the collapsed size, and gives back the growth of the size the Resource
    // was Open at — not the zero growth of the collapsed rect being proposed.
    fc.assert(
      fc.property(entriesArb, subjectArb, sizeArb, (generated, subjectIndex, openSize) => {
        const subjectId = RESOURCE_IDS[subjectIndex];
        if (subjectId === undefined) return;
        const snapshot = snapshotOf(with_(generated, subjectIndex, { open: true, openSize }));

        expect(
          completed(SnapshotEdit.resize(snapshot, MAP_ID, subjectId, COLLAPSED_RESOURCE_SIZE)),
        ).toEqual(completed(SnapshotEdit.close(snapshot, MAP_ID, subjectId)));
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('reclaims on x alone from a Resource moved beside the Open Resource, which the Open never pushed', () => {
    // ADR 0084: Open and Close each read the Map as it is and remember nothing
    // about who was pushed, so a Resource dragged beyond the Open Resource
    // *while it is open* moves back with everything else clear of it. And it
    // gives back the width **alone** (ADR 0093): under the half-plane rule ADR
    // 0084 stated, a witness dropped one unit lower than the Open Resource's top
    // was pulled up by the whole height growth on Close — room the Open never
    // took from it.
    fc.assert(
      fc.property(
        entriesArb,
        subjectArb,
        fc.record({
          width: fc.integer({
            min: COLLAPSED_RESOURCE_SIZE.width + 1,
            max: COLLAPSED_RESOURCE_SIZE.width + 600,
          }),
          height: fc.integer({
            min: COLLAPSED_RESOURCE_SIZE.height + 1,
            max: COLLAPSED_RESOURCE_SIZE.height + 600,
          }),
        }),
        fc.record({ x: fc.integer({ min: 1, max: 400 }), y: fc.integer({ min: 1, max: 400 }) }),
        fc.record({
          x: fc.integer({
            min: COLLAPSED_RESOURCE_SIZE.width,
            max: COLLAPSED_RESOURCE_SIZE.width + 400,
          }),
          y: fc.integer({ min: 0, max: 400 }),
        }),
        (generated, subjectIndex, openSize, before, beyond) => {
          const subject = generated[subjectIndex];
          const subjectId = RESOURCE_IDS[subjectIndex];
          const witnessIndex = (subjectIndex + 1) % RESOURCE_IDS.length;
          const witnessId = RESOURCE_IDS[witnessIndex];
          if (subject === undefined || subjectId === undefined || witnessId === undefined) return;

          // Before the subject on both axes, so the Open pushes it nowhere.
          const entries = with_(
            with_(generated, subjectIndex, { open: false, openSize }),
            witnessIndex,
            { x: subject.x - before.x, y: subject.y - before.y, open: false },
          );
          const opened = completed(SnapshotEdit.open(snapshotOf(entries), MAP_ID, subjectId));
          expect(positionsOf(opened)[witnessId]).toMatchObject({
            x: subject.x - before.x,
            y: subject.y - before.y,
          });

          // The author drags it past the Open Resource.
          const destination = { x: subject.x + beyond.x, y: subject.y + beyond.y };
          const map = opened.document.maps?.[0];
          if (map === undefined) return;
          const moved: SpaceSnapshot = {
            ...opened,
            document: {
              ...opened.document,
              maps: [
                {
                  ...map,
                  positions: {
                    ...map.positions,
                    [witnessId]: { ...destination, open: false },
                  },
                },
              ],
            },
          };

          const closed = completed(SnapshotEdit.close(moved, MAP_ID, subjectId));

          const growth = Placement.growth(openSize);
          expect(positionsOf(closed)[witnessId]).toMatchObject({
            x: destination.x - growth.width,
            y: destination.y,
          });
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('refuses a Map the snapshot does not name and a Resource the Map does not hold, changing nothing', () => {
    fc.assert(
      fc.property(
        entriesArb,
        fc.uuid().map(uuid),
        fc.constantFrom<'open' | 'close' | 'resize'>('open', 'close', 'resize'),
        (entries, stranger, operation) => {
          fc.pre(!RESOURCE_IDS.some((id) => id === stranger) && stranger !== MAP_ID);
          const snapshot = snapshotOf(entries);
          const subjectId = RESOURCE_IDS[0];
          const run = (mapId: UUID, resourceId: UUID) =>
            operation === 'resize'
              ? SnapshotEdit.resize(snapshot, mapId, resourceId, DEFAULT_OPEN_SIZE)
              : SnapshotEdit[operation](snapshot, mapId, resourceId);

          expect(run(stranger, subjectId)).toEqual({
            kind: 'refused',
            refusal: { code: 'map-not-found' },
          });
          expect(run(MAP_ID, stranger)).toEqual({
            kind: 'refused',
            refusal: { code: 'resource-not-in-map' },
          });
        },
      ),
    );
  });

  it('refuses to Resize a Closed Resource, which has no Open Size to change', () => {
    fc.assert(
      fc.property(entriesArb, subjectArb, resizeArb, (generated, subjectIndex, size) => {
        const subjectId = RESOURCE_IDS[subjectIndex];
        if (subjectId === undefined) return;
        const snapshot = snapshotOf(with_(generated, subjectIndex, { open: false }));

        expect(SnapshotEdit.resize(snapshot, MAP_ID, subjectId, size)).toEqual({
          kind: 'refused',
          refusal: { code: 'resource-not-expanded' },
        });
      }),
    );
  });
});

describe('SnapshotEdit across two Maps: addToMap, removeFromMap and deleteFromSpace', () => {
  const OTHER_MAP_ID = uuid('00000000-0000-4000-8000-000000000004');
  const OTHER_GRAPH_ID = uuid('00000000-0000-4000-8000-000000000005');

  /**
   * Two Maps over the same Resources, each owning a Graph chained through all
   * of them, so a Resource removed from one has incident Edges in both.
   * `absent` is left out of the first Map, for Add to Map to add back.
   */
  const twoMaps = (
    ids: readonly UUID[],
    coords: readonly number[],
    open: boolean,
    absent?: UUID,
  ): SpaceSnapshot => {
    const placement = closedPlacement(ids, coords);
    const members = ids.filter((id) => id !== absent);
    const first = Placement.toPositions(
      Placement.fromEntries(
        members.map((id): [UUID, ResourcePlacement] => {
          const at = placement.get(id) ?? { x: 0, y: 0, open: false };
          return [id, open ? { x: at.x, y: at.y, open: true, openSize: DEFAULT_OPEN_SIZE } : at];
        }),
      ),
    );
    const base = baseSnapshot(ids, first, chainEdges(members));
    return {
      ...base,
      document: {
        ...base.document,
        maps: [
          ...(base.document.maps ?? []),
          {
            id: OTHER_MAP_ID,
            title: 'Map 2',
            kind: 'positioned',
            positions: Placement.toPositions(placement),
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Graph 2', edges: chainEdges(ids) }],
          },
        ],
      },
    };
  };

  const completed = (outcome: SnapshotEditOutcome): SpaceSnapshot => {
    if (outcome.kind !== 'completed') throw new Error(`Expected completed, got ${outcome.kind}`);
    expect(loadSpaceSnapshot(outcome.snapshot).ok).toBe(true);
    return outcome.snapshot;
  };

  const mapIn = (snapshot: SpaceSnapshot, mapId: UUID) =>
    snapshot.document.maps?.find((map) => map.id === mapId);

  it('removes a Resource from the one Map only, with every Edge incident to it there', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.boolean(),
        (ids, coords, subjectSeed, open) => {
          const subject = ids[subjectSeed % ids.length];
          if (subject === undefined) return;
          const snapshot = twoMaps(ids, coords, open);

          const removed = completed(SnapshotEdit.removeFromMap(snapshot, MAP_ID, subject));

          const map = mapIn(removed, MAP_ID);
          expect(map?.positions[subject]).toBeUndefined();
          expect(
            map?.graphs
              .flatMap((graph) => graph.edges)
              .some((edge) => edge.from === subject || edge.to === subject),
          ).toBe(false);
          // Graphs stay, empty ones included: deleting a Graph is its own action.
          expect(map?.graphs.map((graph) => graph.id)).toEqual([GRAPH_ID]);
          expect(mapIn(removed, OTHER_MAP_ID)).toEqual(mapIn(snapshot, OTHER_MAP_ID));
          expect(removed.resources).toEqual(snapshot.resources);
        },
      ),
    );
  });

  it('never lands avoidingOverlap on an occupied point, and keeps an exact point as aimed', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.nat({ max: 8 }),
        (ids, coords, subjectSeed, anchorSeed) => {
          const subject = ids[subjectSeed % ids.length];
          const others = ids.filter((id) => id !== subject);
          const neighbour = others[anchorSeed % others.length];
          if (subject === undefined || neighbour === undefined) return;
          const snapshot = twoMaps(ids, coords, false, subject);
          const positions = mapIn(snapshot, MAP_ID)?.positions ?? {};
          const anchor = positions[neighbour];
          if (anchor === undefined) return;

          const avoiding = completed(
            SnapshotEdit.addToMap(snapshot, MAP_ID, subject, anchor, 'avoidingOverlap'),
          );
          const landed = mapIn(avoiding, MAP_ID)?.positions[subject];
          expect(landed?.open).toBe(false);
          expect(
            others.some((id) => positions[id]?.x === landed?.x && positions[id]?.y === landed?.y),
          ).toBe(false);
          // No Edge is inferred back for a Resource added to a Map.
          expect(mapIn(avoiding, MAP_ID)?.graphs).toEqual(mapIn(snapshot, MAP_ID)?.graphs);

          const exact = completed(
            SnapshotEdit.addToMap(snapshot, MAP_ID, subject, anchor, 'exact'),
          );
          expect(mapIn(exact, MAP_ID)?.positions[subject]).toEqual({
            x: anchor.x,
            y: anchor.y,
            open: false,
          });
        },
      ),
    );
  });

  it('gives back the room an Open Resource held, leaving everyone where removing it Closed would', () => {
    // Leaving a Map is a Close the Resource does not come back from (ADR 0084).
    fc.assert(
      fc.property(idsArb, coordsArb, fc.nat({ max: 8 }), (ids, coords, subjectSeed) => {
        const subject = ids[subjectSeed % ids.length];
        if (subject === undefined) return;
        const closed = twoMaps(ids, coords, false);
        const opened = completed(SnapshotEdit.open(closed, MAP_ID, subject));

        const fromClosed = completed(SnapshotEdit.removeFromMap(closed, MAP_ID, subject));
        const fromOpened = completed(SnapshotEdit.removeFromMap(opened, MAP_ID, subject));

        expect(mapIn(fromOpened, MAP_ID)?.positions).toEqual(mapIn(fromClosed, MAP_ID)?.positions);
      }),
    );
  });

  it('deletes a Resource from every Map, reclaiming its room in each, and keeps every Graph', () => {
    // Delete from Space is Remove from Map in every Map at once, plus the
    // Resource's own entry (ADR 0040). Opened in the Map the Edit is not
    // drawing too, so a room stranded there is caught (ADR 0084).
    fc.assert(
      fc.property(idsArb, coordsArb, fc.nat({ max: 8 }), (ids, coords, subjectSeed) => {
        const subject = ids[subjectSeed % ids.length];
        if (subject === undefined) return;
        const closed = twoMaps(ids, coords, false);
        const opened = completed(
          SnapshotEdit.open(
            completed(SnapshotEdit.open(closed, MAP_ID, subject)),
            OTHER_MAP_ID,
            subject,
          ),
        );

        const deleted = completed(SnapshotEdit.deleteFromSpace(opened, subject));

        expect(deleted.resources.some((resource) => resource.id === subject)).toBe(false);
        for (const mapId of [MAP_ID, OTHER_MAP_ID]) {
          const removedClosed = completed(SnapshotEdit.removeFromMap(closed, mapId, subject));
          expect(mapIn(deleted, mapId)?.positions).toEqual(mapIn(removedClosed, mapId)?.positions);
          expect(mapIn(deleted, mapId)?.graphs).toEqual(mapIn(removedClosed, mapId)?.graphs);
        }
        expect(deleted.document.defaultMap).toBe(opened.document.defaultMap);
      }),
    );
  });

  it('refuses a Map, a Resource or a membership it cannot add, changing nothing', () => {
    fc.assert(
      fc.property(idsArb, coordsArb, fc.uuid().map(uuid), (ids, coords, stranger) => {
        fc.pre(!ids.includes(stranger) && stranger !== MAP_ID && stranger !== OTHER_MAP_ID);
        const member = ids[0];
        if (member === undefined) return;
        const snapshot = twoMaps(ids, coords, false);
        const at = { x: 0, y: 0 };

        expect(SnapshotEdit.addToMap(snapshot, stranger, member, at, 'exact')).toEqual({
          kind: 'refused',
          refusal: { code: 'map-not-found' },
        });
        expect(SnapshotEdit.addToMap(snapshot, MAP_ID, stranger, at, 'exact')).toEqual({
          kind: 'refused',
          refusal: { code: 'resource-not-found' },
        });
        expect(SnapshotEdit.addToMap(snapshot, MAP_ID, member, at, 'exact')).toEqual({
          kind: 'refused',
          refusal: { code: 'resource-already-in-map' },
        });
        expect(SnapshotEdit.removeFromMap(snapshot, stranger, member)).toEqual({
          kind: 'refused',
          refusal: { code: 'map-not-found' },
        });
        expect(SnapshotEdit.removeFromMap(snapshot, MAP_ID, stranger)).toEqual({
          kind: 'refused',
          refusal: { code: 'resource-not-in-map' },
        });
      }),
    );
  });

  it('removes a Resource that a Reference Resource targets, which only deletion refuses', () => {
    fc.assert(
      fc.property(
        idsArb,
        coordsArb,
        fc.nat({ max: 8 }),
        fc.uuid().map(uuid),
        (ids, coords, subjectSeed, referenceId) => {
          fc.pre(!ids.includes(referenceId));
          const subject = ids[subjectSeed % ids.length];
          if (subject === undefined) return;
          const base = twoMaps(ids, coords, false);
          const snapshot: SpaceSnapshot = {
            ...base,
            resources: [
              ...base.resources,
              {
                id: referenceId,
                document: { title: 'Reference', kind: 'reference', target: subject },
              },
            ],
          };

          expect(SnapshotEdit.removeFromMap(snapshot, MAP_ID, subject).kind).toBe('completed');
        },
      ),
    );
  });
});
