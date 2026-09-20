import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COLLAPSED_RESOURCE_SIZE,
  DEFAULT_OPEN_SIZE,
  uuidSchema,
  type ResourcePlacement,
  type Map,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';

/**
 * That displacement round-trips **at the Edit** (ADR 0084).
 *
 * `packages/graph/test/placement.test.ts` already generates the same round trip
 * over `Placement.displace` itself. This is not a second copy of it: every case
 * here is driven through `SpaceAuthoring.complete` against a real session, so
 * what it holds is the whole of what an Open, a Close and a Resize choose to
 * apply — which growth each reads off which entry, in which order, and what
 * they write back into the Map. The transform can be an exact involution and
 * the Edits still drift, if an Open reads the default Open Size while the Close
 * reads the remembered one. That is the gap this covers, and it is why ticket 06
 * is blocked by the two tickets that wrote those arms.
 *
 * `space-authoring-operations.test.ts`'s `Expanded Resource geometry` block is the
 * exampled version of the same claims — five Resources at hand-chosen relations to
 * the subject. These are the generated ones.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

/** The Resources every generated Map positions. Five, as the exampled block has. */
const RESOURCE_IDS = [
  uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
  uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
  uuidSchema.parse('00000000-0000-4000-8000-000000000007'),
  uuidSchema.parse('00000000-0000-4000-8000-000000000008'),
  uuidSchema.parse('00000000-0000-4000-8000-000000000009'),
] as const;

/**
 * **The anti-flake mechanism is an explicit `seed` and `numRuns`**, rather than
 * a dedicated arbitrary that guarantees each branch by construction.
 *
 * Ticket 06 allows either. A guaranteeing arbitrary would be a *different*
 * generator from the one the property runs under, so its counts would describe
 * the guarantee rather than the distribution the property was actually checked
 * over — which is the resource worth knowing. Pinning the seed keeps one general
 * generator and makes its case distribution a fixed fact of the suite: the
 * counters below are the same on every machine and every run, so a floor that
 * holds once holds always. The cost is that a generator change has to be
 * re-measured, which is exactly when a coverage claim should be re-read.
 */
const SEED = 84;
const RUNS = 200;

/**
 * The floor every branch clears at {@link SEED}, over {@link RUNS} cases.
 *
 * The counts are a fixed fact of the seed, so they are measured by running the
 * suite rather than stated here. The floor sits well under the smallest of them
 * so that a change to the arbitraries above has to be *large* before it trips —
 * at which point the counts are worth re-measuring rather than the floor worth
 * lowering.
 */
const COVERAGE_FLOOR = 40;

type Extent = { readonly width: number; readonly height: number };

/** A generated Map entry, before it becomes the discriminated `ResourcePlacement`. */
type GeneratedEntry = {
  readonly x: number;
  readonly y: number;
  readonly open: boolean;
  readonly openSize: Extent | undefined;
};

/**
 * A handful of values rather than a wide integer range, because what decides
 * whether a Resource moves is whether it starts **at or past** the subject's
 * collapsed edge (ADR 0093) — the case a wide range essentially never generates.
 * Their differences land exactly on both collapsed edges (260 and 146) and one
 * unit short of each (259 and 145), as well as well inside and well past them.
 */
const coordinateArb = fc.constantFrom(-260, -146, 0, 1, 114, 146, 260, 261, 520);

/** An Open Size the schema accepts: never below the collapsed rect on either axis. */
const openSizeArb = fc.record({
  width: fc.integer({
    min: COLLAPSED_RESOURCE_SIZE.width,
    max: COLLAPSED_RESOURCE_SIZE.width + 600,
  }),
  height: fc.integer({
    min: COLLAPSED_RESOURCE_SIZE.height,
    max: COLLAPSED_RESOURCE_SIZE.height + 600,
  }),
});

/**
 * A resize proposal, never the collapsed rect exactly.
 *
 * That one proposal is the magnetic Close (ADR 0066) and takes the Close path,
 * so it would end the Open rather than resize it. It has its own exampled case
 * next door; here it would simply make the sequence under test a different one.
 */
const resizeArb = openSizeArb.filter(
  (size) =>
    size.width !== COLLAPSED_RESOURCE_SIZE.width || size.height !== COLLAPSED_RESOURCE_SIZE.height,
);

const entryArb = fc.record({
  x: coordinateArb,
  y: coordinateArb,
  open: fc.boolean(),
  openSize: fc.option(openSizeArb, { nil: undefined }),
});

const entriesArb = fc.array(entryArb, {
  minLength: RESOURCE_IDS.length,
  maxLength: RESOURCE_IDS.length,
});

const subjectArb = fc.nat({ max: RESOURCE_IDS.length - 1 });

const placementOf = (entry: GeneratedEntry): ResourcePlacement => {
  if (entry.open) {
    return { x: entry.x, y: entry.y, open: true, openSize: entry.openSize ?? DEFAULT_OPEN_SIZE };
  }
  return entry.openSize === undefined
    ? { x: entry.x, y: entry.y, open: false }
    : { x: entry.x, y: entry.y, open: false, openSize: entry.openSize };
};

/** The same entries with one Resource's remembered Open Size replaced. */
const rememberingOpenSize = (
  entries: readonly GeneratedEntry[],
  at: number,
  openSize: Extent,
): readonly GeneratedEntry[] =>
  entries.map((entry, index) => (index === at ? { ...entry, openSize } : entry));

/** The same entries with one Resource Closed. */
const closing = (entries: readonly GeneratedEntry[], at: number): readonly GeneratedEntry[] =>
  entries.map((entry, index) => (index === at ? { ...entry, open: false } : entry));

/** The same entries with one Resource moved to a named point and Closed. */
const placing = (
  entries: readonly GeneratedEntry[],
  at: number,
  point: { readonly x: number; readonly y: number },
): readonly GeneratedEntry[] =>
  entries.map((entry, index) =>
    index === at ? { ...entry, x: point.x, y: point.y, open: false } : entry,
  );

/** One Space, one Map, one empty Graph: the geometry is the whole subject. */
const snapshotOf = (entries: readonly GeneratedEntry[]): SpaceSnapshot => {
  const positions: Record<string, ResourcePlacement> = {};
  RESOURCE_IDS.forEach((resourceId, index) => {
    const entry = entries[index];
    if (entry !== undefined) positions[resourceId] = placementOf(entry);
  });
  return {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      maps: [
        {
          id: MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions,
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
        },
      ],
      defaultMap: MAP_ID,
    },
    resources: RESOURCE_IDS.map((resourceId, index) => ({
      id: resourceId,
      document: { title: `Resource ${index + 1}`, kind: 'markdown', body: '' },
    })),
  };
};

/** A composed Space over the generated Map, opened on its own geometry. */
const openAuthoring = (entries: readonly GeneratedEntry[]) => {
  const snapshot = snapshotOf(entries);
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const { authoring } = composeApp({ spaceSession: session, selection: MAP_ID });
  return { session, authoring };
};

type Session = ReturnType<typeof openAuthoring>['session'];

const mapIn = (snapshot: SpaceSnapshot): Map | undefined =>
  (snapshot.document.maps ?? []).find((map) => map.id === MAP_ID);

/** Every origin the Map authors, so a whole Map can be compared at once. */
const originsOf = (session: Session) => {
  const positions = mapIn(session.getState().working)?.positions ?? {};
  const origins: Record<string, readonly [number, number]> = {};
  for (const [resourceId, at] of Object.entries(positions)) {
    if (at !== undefined) origins[resourceId] = [at.x, at.y];
  }
  return origins;
};

const entryIn = (session: Session, resourceId: UUID): ResourcePlacement | undefined =>
  mapIn(session.getState().working)?.positions[resourceId];

type CoverageCounts = {
  clearOnXOnly: number;
  clearOnYOnly: number;
  clearOnBoth: number;
  clearOnNeither: number;
  subjectOpen: number;
  subjectClosed: number;
};

/**
 * What each generated case had in it, so a property cannot pass vacuously.
 *
 * A generator that never placed a Resource clear of the subject on both axes — the
 * case that moves on `x` alone although it is clear on `y` too — would satisfy
 * every property below while proving nothing about the transform, and nothing in
 * a green run would say so. A case counts toward a branch when **some**
 * non-subject Resource stands in that relation to the subject, so one case can
 * count toward several.
 */
const createCoverage = () => {
  const counts: CoverageCounts = {
    clearOnXOnly: 0,
    clearOnYOnly: 0,
    clearOnBoth: 0,
    clearOnNeither: 0,
    subjectOpen: 0,
    subjectClosed: 0,
  };
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
    if (seen.x) counts.clearOnXOnly += 1;
    if (seen.y) counts.clearOnYOnly += 1;
    if (seen.both) counts.clearOnBoth += 1;
    if (seen.neither) counts.clearOnNeither += 1;
    if (subject.open) counts.subjectOpen += 1;
    else counts.subjectClosed += 1;
  };
  return { counts, record };
};

/** The four relations to the collapsed subject that decide a room axis, all present. */
const expectEveryRelationGenerated = (counts: CoverageCounts): void => {
  expect(counts.clearOnXOnly).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  expect(counts.clearOnYOnly).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  expect(counts.clearOnBoth).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  expect(counts.clearOnNeither).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
};

/**
 * A generated Map may hand the pair a subject that is already Open, and the
 * pair's claim does not start there: `displace` is an involution for a
 * **nonnegative** growth applied first, which is the Open. Closing first
 * applies the negation first, and a Resource less than one growth past the
 * subject's collapsed edge is carried back inside it and no longer found — ADR 0084 states that
 * asymmetry rather than clamping it, and the product never reaches it because
 * Close only ever negates a growth an Open already applied.
 *
 * So an Open subject is Closed here as **setup**, before the round trip is
 * measured. That keeps the generator free to produce Maps with Open Resources in
 * them — including the subject — while every measured sequence is one the
 * product can actually perform.
 */
const closedForTheRoundTrip = (
  authoring: ReturnType<typeof openAuthoring>['authoring'],
  subject: GeneratedEntry,
  subjectId: UUID,
): void => {
  if (!subject.open) return;
  expect(authoring.complete({ kind: 'closed-resource', resourceId: subjectId })).toEqual({
    kind: 'completed',
  });
};

describe('Displacement at the Edit', () => {
  it('round-trips every position through the Open/Close pair', () => {
    // The property the memoryless pair rests on (ADR 0084): Close reclaims from
    // where resources are rather than from a record of who was pushed, and that is
    // only defensible if the untouched case is exact — otherwise repeated
    // open/close drifts the Map, which is the one failure the derived model
    // could not have had.
    const coverage = createCoverage();
    fc.assert(
      fc.property(entriesArb, subjectArb, openSizeArb, (generated, subjectIndex, openSize) => {
        // The Open Size the Edit will apply is the one the entry remembers, so
        // both halves of the pair read the same number off the same place.
        const entries = rememberingOpenSize(generated, subjectIndex, openSize);
        const subjectId = RESOURCE_IDS[subjectIndex];
        const subject = entries[subjectIndex];
        if (subjectId === undefined || subject === undefined) return;
        coverage.record(entries, subjectIndex);

        const { session, authoring } = openAuthoring(entries);
        closedForTheRoundTrip(authoring, subject, subjectId);
        const before = originsOf(session);

        expect(authoring.complete({ kind: 'opened-resource', resourceId: subjectId })).toEqual({
          kind: 'completed',
        });
        expect(authoring.complete({ kind: 'closed-resource', resourceId: subjectId })).toEqual({
          kind: 'completed',
        });

        // Every Resource, not only the subject: an Edit that moved a neighbour and
        // failed to give the room back is exactly the drift this rules out.
        expect(originsOf(session)).toEqual(before);
        expect(entryIn(session, subjectId)?.open).toBe(false);
        // Open Size survives Closing (ADR 0066), so the next Open applies
        // exactly what this Close gave back.
        expect(entryIn(session, subjectId)?.openSize).toEqual(openSize);
      }),
      { seed: SEED, numRuns: RUNS },
    );

    expectEveryRelationGenerated(coverage.counts);
    expect(coverage.counts.subjectOpen).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    expect(coverage.counts.subjectClosed).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });

  it('round-trips every position through Open, any number of Resizes and Close', () => {
    // Resize applies the *difference* between two growths rather than a growth,
    // so a Map can only come back if every difference sums to the growth the
    // Close then reclaims. Generating shrinks as well as grows is what makes
    // that a claim about the arithmetic rather than about monotone sequences.
    const coverage = createCoverage();
    fc.assert(
      fc.property(
        entriesArb,
        subjectArb,
        openSizeArb,
        fc.array(resizeArb, { maxLength: 5 }),
        (generated, subjectIndex, openSize, resizes) => {
          const entries = rememberingOpenSize(generated, subjectIndex, openSize);
          const subjectId = RESOURCE_IDS[subjectIndex];
          const subject = entries[subjectIndex];
          if (subjectId === undefined || subject === undefined) return;
          coverage.record(entries, subjectIndex);

          const { session, authoring } = openAuthoring(entries);
          closedForTheRoundTrip(authoring, subject, subjectId);
          const before = originsOf(session);

          expect(authoring.complete({ kind: 'opened-resource', resourceId: subjectId })).toEqual({
            kind: 'completed',
          });
          for (const size of resizes) {
            const result = authoring.complete({
              kind: 'resized-resource',
              resourceId: subjectId,
              size,
            });
            // `unchanged` when the proposal is the size the Resource already has,
            // which is a legitimate outcome and moves nobody.
            expect(result.kind === 'completed' || result.kind === 'unchanged').toBe(true);
          }
          expect(authoring.complete({ kind: 'closed-resource', resourceId: subjectId })).toEqual({
            kind: 'completed',
          });

          expect(originsOf(session)).toEqual(before);
          // The Close reclaims the growth of the size the Resource was last Open at,
          // which is the last Resize the sequence accepted (ADR 0066).
          expect(entryIn(session, subjectId)?.openSize).toEqual(resizes.at(-1) ?? openSize);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );

    expectEveryRelationGenerated(coverage.counts);
    expect(coverage.counts.subjectOpen).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    expect(coverage.counts.subjectClosed).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });

  it('reclaims from a Resource the author moved beside the Open Resource, which the Open never pushed, on x alone', () => {
    // ADR 0084, "Closing reclaims from where resources are now": Open and Close
    // each read the Map as it is at that moment and remember nothing about
    // how it got there, so a Resource dragged beyond the Open Resource *while it is
    // open* moves back with everything else clear of it. That is deliberate and
    // it is what makes the pair memoryless. The alternative the ADR rejects is
    // recording which Resources a particular Open pushed and by how much: it is
    // per-open-Resource stored state, it goes stale the moment the author moves
    // anything, and it makes two Maps with identical positions behave
    // differently because of history neither of them shows.
    //
    // A dedicated arbitrary here rather than a counter: the witness is placed
    // strictly *before* the subject on both axes and dragged to clear of its
    // collapsed rect on `x`, anywhere on `y` from level with it to well below, so
    // "was never pushed" and "is reclaimed from" are properties of the generator
    // rather than branches it might miss.
    //
    // And it gives back the width **alone** (ADR 0093). Under the half-plane
    // rule ADR 0084 stated, a witness dropped beside the Open Resource one unit
    // lower than its top was pulled up by the whole height growth on Close —
    // room the Open never took from it.
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
          const subjectIn = generated[subjectIndex];
          const subjectId = RESOURCE_IDS[subjectIndex];
          if (subjectIn === undefined || subjectId === undefined) return;
          const witnessIndex = (subjectIndex + 1) % RESOURCE_IDS.length;
          const witnessId = RESOURCE_IDS[witnessIndex];
          if (witnessId === undefined) return;

          const entries = placing(
            closing(rememberingOpenSize(generated, subjectIndex, openSize), subjectIndex),
            witnessIndex,
            { x: subjectIn.x - before.x, y: subjectIn.y - before.y },
          );
          const witness = entries[witnessIndex];
          if (witness === undefined) return;

          const { session, authoring } = openAuthoring(entries);
          expect(authoring.complete({ kind: 'opened-resource', resourceId: subjectId })).toEqual({
            kind: 'completed',
          });
          // Before the subject on both axes, so the Open pushed it nowhere.
          expect(originsOf(session)[witnessId]).toEqual([witness.x, witness.y]);

          // The author drags it past the Open Resource, through the path a canvas
          // move really takes: a settled movement carrying its own drop point,
          // merged over the Map's positions at derivation.
          const destination = { x: subjectIn.x + beyond.x, y: subjectIn.y + beyond.y };
          expect(
            authoring.complete({
              kind: 'settled-resource-movement',
              moved: new Map([[witnessId, destination]]),
            }),
          ).toEqual({ kind: 'completed' });
          expect(originsOf(session)[witnessId]).toEqual([destination.x, destination.y]);

          expect(authoring.complete({ kind: 'closed-resource', resourceId: subjectId })).toEqual({
            kind: 'completed',
          });

          const growth = Placement.growth(openSize);
          expect(originsOf(session)[witnessId]).toEqual([
            destination.x - growth.width,
            destination.y,
          ]);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});
