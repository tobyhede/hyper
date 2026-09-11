import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COLLAPSED_THING_SIZE,
  DEFAULT_OPEN_SIZE,
  uuidSchema,
  type ThingPlacement,
  type Diagram,
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
 * they write back into the Diagram. The transform can be an exact involution and
 * the Edits still drift, if an Open reads the default Open Size while the Close
 * reads the remembered one. That is the gap this covers, and it is why ticket 06
 * is blocked by the two tickets that wrote those arms.
 *
 * `space-authoring-operations.test.ts`'s `Expanded Thing geometry` block is the
 * exampled version of the same claims — five Things at hand-chosen relations to
 * the subject. These are the generated ones.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

/** The Things every generated Diagram positions. Five, as the exampled block has. */
const THING_IDS = [
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
 * over — which is the thing worth knowing. Pinning the seed keeps one general
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
 * Measured rather than guessed, and the counts are a fixed fact of the seed:
 * 100 cases with some Thing beyond the subject on `x` only, 106 on `y` only, 73
 * on both, 137 on neither, and the subject arriving Open in 90 of them against
 * Closed in 110. The floor sits well under the smallest of those so that a
 * change to the arbitraries above has to be *large* before it trips — at which
 * point the counts are worth re-measuring rather than the floor worth lowering.
 */
const COVERAGE_FLOOR = 40;

type Extent = { readonly width: number; readonly height: number };

/** A generated Diagram entry, before it becomes the discriminated `ThingPlacement`. */
type GeneratedEntry = {
  readonly x: number;
  readonly y: number;
  readonly open: boolean;
  readonly openSize: Extent | undefined;
};

/**
 * A small grid rather than a wide integer range, because the comparison under
 * test is **strict** — two Things level on an axis is the case a wide range
 * essentially never generates, and it is the one that decides whether a Thing
 * moves at all on that axis.
 */
const coordinateArb = fc.constantFrom(-200, -100, 0, 100, 200);

/** An Open Size the schema accepts: never below the collapsed rect on either axis. */
const openSizeArb = fc.record({
  width: fc.integer({ min: COLLAPSED_THING_SIZE.width, max: COLLAPSED_THING_SIZE.width + 600 }),
  height: fc.integer({ min: COLLAPSED_THING_SIZE.height, max: COLLAPSED_THING_SIZE.height + 600 }),
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
    size.width !== COLLAPSED_THING_SIZE.width || size.height !== COLLAPSED_THING_SIZE.height,
);

const entryArb = fc.record({
  x: coordinateArb,
  y: coordinateArb,
  open: fc.boolean(),
  openSize: fc.option(openSizeArb, { nil: undefined }),
});

const entriesArb = fc.array(entryArb, {
  minLength: THING_IDS.length,
  maxLength: THING_IDS.length,
});

const subjectArb = fc.nat({ max: THING_IDS.length - 1 });

const placementOf = (entry: GeneratedEntry): ThingPlacement => {
  if (entry.open) {
    return { x: entry.x, y: entry.y, open: true, openSize: entry.openSize ?? DEFAULT_OPEN_SIZE };
  }
  return entry.openSize === undefined
    ? { x: entry.x, y: entry.y, open: false }
    : { x: entry.x, y: entry.y, open: false, openSize: entry.openSize };
};

/** The same entries with one Thing's remembered Open Size replaced. */
const rememberingOpenSize = (
  entries: readonly GeneratedEntry[],
  at: number,
  openSize: Extent,
): readonly GeneratedEntry[] =>
  entries.map((entry, index) => (index === at ? { ...entry, openSize } : entry));

/** The same entries with one Thing Closed. */
const closing = (entries: readonly GeneratedEntry[], at: number): readonly GeneratedEntry[] =>
  entries.map((entry, index) => (index === at ? { ...entry, open: false } : entry));

/** The same entries with one Thing moved to a named point and Closed. */
const placing = (
  entries: readonly GeneratedEntry[],
  at: number,
  point: { readonly x: number; readonly y: number },
): readonly GeneratedEntry[] =>
  entries.map((entry, index) =>
    index === at ? { ...entry, x: point.x, y: point.y, open: false } : entry,
  );

/** One Space, one Diagram, one empty Graph: the geometry is the whole subject. */
const snapshotOf = (entries: readonly GeneratedEntry[]): SpaceSnapshot => {
  const positions: Record<string, ThingPlacement> = {};
  THING_IDS.forEach((thingId, index) => {
    const entry = entries[index];
    if (entry !== undefined) positions[thingId] = placementOf(entry);
  });
  return {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      diagrams: [
        {
          id: DIAGRAM_ID,
          title: 'Diagram 1',
          kind: 'positioned',
          positions,
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
        },
      ],
      defaultDiagram: DIAGRAM_ID,
    },
    things: THING_IDS.map((thingId, index) => ({
      id: thingId,
      document: { title: `Thing ${index + 1}`, kind: 'markdown', body: '' },
    })),
  };
};

/**
 * A composed Space over the generated Diagram, with the geometry the canvas
 * would have reported by now already installed.
 */
const openAuthoring = (entries: readonly GeneratedEntry[]) => {
  const snapshot = snapshotOf(entries);
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const { authoring } = composeApp({
    spaceSession: session,
    selection: DIAGRAM_ID,
    initialPlacement: null,
  });
  const diagram = snapshot.document.diagrams?.[0];
  if (diagram === undefined) throw new Error('the generated Space must hold its Diagram');
  authoring.replacePlacement(Placement.fromDiagram(diagram));
  return { session, authoring };
};

type Session = ReturnType<typeof openAuthoring>['session'];

const diagramIn = (snapshot: SpaceSnapshot): Diagram | undefined =>
  (snapshot.document.diagrams ?? []).find((diagram) => diagram.id === DIAGRAM_ID);

/** Every origin the Diagram authors, so a whole Diagram can be compared at once. */
const originsOf = (session: Session) => {
  const positions = diagramIn(session.getState().working)?.positions ?? {};
  const origins: Record<string, readonly [number, number]> = {};
  for (const [thingId, at] of Object.entries(positions)) {
    if (at !== undefined) origins[thingId] = [at.x, at.y];
  }
  return origins;
};

const entryIn = (session: Session, thingId: UUID): ThingPlacement | undefined =>
  diagramIn(session.getState().working)?.positions[thingId];

/** The geometry React Flow would report with one Thing dragged to a new point. */
const renderedWith = (
  session: Session,
  movedId: UUID,
  to: { readonly x: number; readonly y: number },
): Placement => {
  const positions = diagramIn(session.getState().working)?.positions ?? {};
  return Placement.fromEntries(
    THING_IDS.flatMap((thingId) => {
      const at = positions[thingId];
      if (at === undefined) return [];
      return [[thingId, thingId === movedId ? to : { x: at.x, y: at.y }] as const];
    }),
  );
};

type CoverageCounts = {
  beyondOnXOnly: number;
  beyondOnYOnly: number;
  beyondOnBoth: number;
  beyondOnNeither: number;
  subjectOpen: number;
  subjectClosed: number;
};

/**
 * What each generated case had in it, so a property cannot pass vacuously.
 *
 * A generator that never placed a Thing strictly beyond the subject on both axes
 * would satisfy every property below while proving nothing about the transform,
 * and nothing in a green run would say so. A case counts toward a branch when
 * **some** non-subject Thing stands in that relation to the subject, so one case
 * can count toward several.
 */
const createCoverage = () => {
  const counts: CoverageCounts = {
    beyondOnXOnly: 0,
    beyondOnYOnly: 0,
    beyondOnBoth: 0,
    beyondOnNeither: 0,
    subjectOpen: 0,
    subjectClosed: 0,
  };
  const record = (entries: readonly GeneratedEntry[], subjectIndex: number): void => {
    const subject = entries[subjectIndex];
    if (subject === undefined) return;
    const seen = { x: false, y: false, both: false, neither: false };
    entries.forEach((entry, index) => {
      if (index === subjectIndex) return;
      const beyondX = entry.x > subject.x;
      const beyondY = entry.y > subject.y;
      if (beyondX && beyondY) seen.both = true;
      else if (beyondX) seen.x = true;
      else if (beyondY) seen.y = true;
      else seen.neither = true;
    });
    if (seen.x) counts.beyondOnXOnly += 1;
    if (seen.y) counts.beyondOnYOnly += 1;
    if (seen.both) counts.beyondOnBoth += 1;
    if (seen.neither) counts.beyondOnNeither += 1;
    if (subject.open) counts.subjectOpen += 1;
    else counts.subjectClosed += 1;
  };
  return { counts, record };
};

/** The four relations the strict per-axis comparison distinguishes, all present. */
const expectEveryRelationGenerated = (counts: CoverageCounts): void => {
  expect(counts.beyondOnXOnly).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  expect(counts.beyondOnYOnly).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  expect(counts.beyondOnBoth).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  expect(counts.beyondOnNeither).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
};

/**
 * A generated Diagram may hand the pair a subject that is already Open, and the
 * pair's claim does not start there: `displace` is an involution for a
 * **nonnegative** growth applied first, which is the Open. Closing first
 * applies the negation first, and a Thing less than one growth beyond the
 * subject is carried back across it and no longer found — ADR 0084 states that
 * asymmetry rather than clamping it, and the product never reaches it because
 * Close only ever negates a growth an Open already applied.
 *
 * So an Open subject is Closed here as **setup**, before the round trip is
 * measured. That keeps the generator free to produce Diagrams with Open Things in
 * them — including the subject — while every measured sequence is one the
 * product can actually perform.
 */
const closedForTheRoundTrip = (
  authoring: ReturnType<typeof openAuthoring>['authoring'],
  subject: GeneratedEntry,
  subjectId: UUID,
): void => {
  if (!subject.open) return;
  expect(authoring.complete({ kind: 'closed-thing', thingId: subjectId })).toEqual({
    kind: 'completed',
  });
};

describe('Displacement at the Edit', () => {
  it('round-trips every position through the Open/Close pair', () => {
    // The property the memoryless pair rests on (ADR 0084): Close reclaims from
    // where things are rather than from a record of who was pushed, and that is
    // only defensible if the untouched case is exact — otherwise repeated
    // open/close drifts the Diagram, which is the one failure the derived model
    // could not have had.
    const coverage = createCoverage();
    fc.assert(
      fc.property(entriesArb, subjectArb, openSizeArb, (generated, subjectIndex, openSize) => {
        // The Open Size the Edit will apply is the one the entry remembers, so
        // both halves of the pair read the same number off the same place.
        const entries = rememberingOpenSize(generated, subjectIndex, openSize);
        const subjectId = THING_IDS[subjectIndex];
        const subject = entries[subjectIndex];
        if (subjectId === undefined || subject === undefined) return;
        coverage.record(entries, subjectIndex);

        const { session, authoring } = openAuthoring(entries);
        closedForTheRoundTrip(authoring, subject, subjectId);
        const before = originsOf(session);

        expect(authoring.complete({ kind: 'opened-thing', thingId: subjectId })).toEqual({
          kind: 'completed',
        });
        expect(authoring.complete({ kind: 'closed-thing', thingId: subjectId })).toEqual({
          kind: 'completed',
        });

        // Every Thing, not only the subject: an Edit that moved a neighbour and
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
    // so a Diagram can only come back if every difference sums to the growth the
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
          const subjectId = THING_IDS[subjectIndex];
          const subject = entries[subjectIndex];
          if (subjectId === undefined || subject === undefined) return;
          coverage.record(entries, subjectIndex);

          const { session, authoring } = openAuthoring(entries);
          closedForTheRoundTrip(authoring, subject, subjectId);
          const before = originsOf(session);

          expect(authoring.complete({ kind: 'opened-thing', thingId: subjectId })).toEqual({
            kind: 'completed',
          });
          for (const size of resizes) {
            const result = authoring.complete({ kind: 'resized-thing', thingId: subjectId, size });
            // `unchanged` when the proposal is the size the Thing already has,
            // which is a legitimate outcome and moves nobody.
            expect(result.kind === 'completed' || result.kind === 'unchanged').toBe(true);
          }
          expect(authoring.complete({ kind: 'closed-thing', thingId: subjectId })).toEqual({
            kind: 'completed',
          });

          expect(originsOf(session)).toEqual(before);
          // The Close reclaims the growth of the size the Thing was last Open at,
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

  it('reclaims from a Thing the author moved beyond the Open Thing, which the Open never pushed', () => {
    // ADR 0084, "Closing reclaims from where things are now": Open and Close
    // each read the Diagram as it is at that moment and remember nothing about
    // how it got there, so a Thing dragged beyond the Open Thing *while it is
    // open* moves back with everything else beyond it. That is deliberate and
    // it is what makes the pair memoryless. The alternative the ADR rejects is
    // recording which Things a particular Open pushed and by how much: it is
    // per-open-Thing stored state, it goes stale the moment the author moves
    // anything, and it makes two Diagrams with identical positions behave
    // differently because of history neither of them shows.
    //
    // A dedicated arbitrary here rather than a counter: the witness is placed
    // strictly *before* the subject on both axes and dragged to strictly beyond
    // it on both, so "was never pushed" and "is reclaimed from" are properties
    // of the generator rather than branches it might miss.
    fc.assert(
      fc.property(
        entriesArb,
        subjectArb,
        fc.record({
          width: fc.integer({
            min: COLLAPSED_THING_SIZE.width + 1,
            max: COLLAPSED_THING_SIZE.width + 600,
          }),
          height: fc.integer({
            min: COLLAPSED_THING_SIZE.height + 1,
            max: COLLAPSED_THING_SIZE.height + 600,
          }),
        }),
        fc.record({ x: fc.integer({ min: 1, max: 400 }), y: fc.integer({ min: 1, max: 400 }) }),
        fc.record({ x: fc.integer({ min: 1, max: 400 }), y: fc.integer({ min: 1, max: 400 }) }),
        (generated, subjectIndex, openSize, before, beyond) => {
          const subjectIn = generated[subjectIndex];
          const subjectId = THING_IDS[subjectIndex];
          if (subjectIn === undefined || subjectId === undefined) return;
          const witnessIndex = (subjectIndex + 1) % THING_IDS.length;
          const witnessId = THING_IDS[witnessIndex];
          if (witnessId === undefined) return;

          const entries = placing(
            closing(rememberingOpenSize(generated, subjectIndex, openSize), subjectIndex),
            witnessIndex,
            { x: subjectIn.x - before.x, y: subjectIn.y - before.y },
          );
          const witness = entries[witnessIndex];
          if (witness === undefined) return;

          const { session, authoring } = openAuthoring(entries);
          expect(authoring.complete({ kind: 'opened-thing', thingId: subjectId })).toEqual({
            kind: 'completed',
          });
          // Before the subject on both axes, so the Open pushed it nowhere.
          expect(originsOf(session)[witnessId]).toEqual([witness.x, witness.y]);

          // The author drags it past the Open Thing, through the path a canvas
          // move really takes: a settled movement reporting what React Flow
          // draws, merged under `Placement.next`.
          const destination = { x: subjectIn.x + beyond.x, y: subjectIn.y + beyond.y };
          expect(
            authoring.complete({
              kind: 'settled-thing-movement',
              rendered: renderedWith(session, witnessId, destination),
              placed: [witnessId],
            }),
          ).toEqual({ kind: 'completed' });
          expect(originsOf(session)[witnessId]).toEqual([destination.x, destination.y]);

          expect(authoring.complete({ kind: 'closed-thing', thingId: subjectId })).toEqual({
            kind: 'completed',
          });

          const growth = Placement.growth(openSize);
          expect(originsOf(session)[witnessId]).toEqual([
            destination.x - growth.width,
            destination.y - growth.height,
          ]);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});
