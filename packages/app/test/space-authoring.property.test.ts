import fc from 'fast-check';
import { expect, it } from 'vitest';

import {
  uuidSchema,
  type Card,
  type Graph,
  type Layout,
  type LayoutId,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { GRAPH_PALETTE } from '../src/colors';
import { composeApp } from '../src/compose-app';
import type { AuthoringCompletion, AuthoringResult } from '../src/space-authoring';

/**
 * What every semantic operation owes, whatever order they arrive in.
 *
 * The transition tests say what one operation writes; this says what none of
 * them may ever do. Three obligations, and the first is the one the others exist
 * to make meaningful:
 *
 * 1. The working Space always passes normal domain intake. A completed Edit
 *    derives and validates the whole next Space before a collaborator moves, so
 *    an Edit that would break Layout membership, Edge closure, Alias resolution
 *    or Graph ownership is refused rather than stored — and the sequence keeps
 *    going afterwards.
 * 2. An operation that is not an Edit changes nothing. `unchanged` and `refused`
 *    both leave the working snapshot's *identity* alone, which is stronger than
 *    leaving its value alone and is what a surface relies on when it keeps a
 *    draft open over a refusal.
 * 3. Nothing throws. A refusal is a stable identity, not an exception; a throw here
 *    would be a broken invariant, and the point of generating hostile sequences
 *    is to find one.
 *
 * The identities are drawn as *indices* resolved against the live Space rather
 * than as literals, so a generated operation names something real often enough
 * to reach past the refusals — while the deliberate out-of-range values keep the
 * stale paths in the sequence too.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');

/**
 * Two Layouts, an Alias, a Card one Layout omits and a Graph in each — the
 * smallest Space in which every rule under test has something to bite on.
 */
const start: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 10, y: 20, open: false },
          [CARD_B]: { x: 300, y: 40, open: false },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] },
          { id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: CARD_B, to: CARD_B }] },
        ],
      },
      {
        id: OTHER_LAYOUT_ID,
        title: 'Layout 2',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 0, y: 400, open: false },
          [CARD_C]: { x: 0, y: 600, open: false },
        },
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000006'),
            title: 'Elsewhere',
            edges: [{ from: CARD_A, to: CARD_C }],
          },
        ],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: CARD_C, document: { title: 'A again', kind: 'alias', target: CARD_A } },
  ],
};

/** An index the generator may take past the end of whatever it is indexing. */
const index = fc.integer({ min: 0, max: 4 });
const anchor = fc.record({
  x: fc.integer({ min: -500, max: 500 }),
  y: fc.integer({ min: -500, max: 500 }),
});

/**
 * A generated operation, still holding indices rather than identities.
 *
 * `settled-card-movement` and the two connect gestures are absent because they
 * carry rendered geometry a pointer produces; their eligibility is pinned in
 * `space-authoring.test.ts` against the real report.
 */
const operation = fc.oneof(
  fc.record({ op: fc.constant('created-card' as const), anchor }),
  fc.record({ op: fc.constant('created-alias' as const), card: index, anchor }),
  /**
   * Card editing includes attempts to change an Alias's immutable Target. The
   * title is generated blank sometimes on purpose: an empty one must refuse
   * rather than reach intake.
   */
  fc.record({
    op: fc.constant('edited-card' as const),
    card: index,
    title: fc.oneof(fc.constant(''), fc.constant('  '), fc.string({ maxLength: 8 })),
    proposedTarget: fc.option(index, { nil: undefined }),
  }),
  fc.record({ op: fc.constant('added-card-to-layout' as const), card: index, anchor }),
  fc.record({ op: fc.constant('removed-card-from-layout' as const), card: index }),
  fc.record({ op: fc.constant('deleted-card' as const), card: index }),
  fc.record({ op: fc.constant('added-graph' as const) }),
  fc.record({
    op: fc.constant('renamed-graph' as const),
    graph: index,
    title: fc.string({ maxLength: 8 }),
  }),
  fc.record({
    op: fc.constant('recolored-graph' as const),
    graph: index,
    color: fc.constantFrom(...GRAPH_PALETTE),
  }),
  fc.record({ op: fc.constant('deleted-graph' as const), graph: index }),
  fc.record({ op: fc.constant('deleted-edge' as const), graph: index, edge: index }),
  fc.record({
    op: fc.constant('reconnected-edge' as const),
    graph: index,
    edge: index,
    endpoint: fc.constantFrom('from' as const, 'to' as const),
    card: index,
  }),
);

type GeneratedOperation = ReturnType<typeof operation.generate>['value'];

/** An identity that is nothing, so an out-of-range index still names something. */
const NOTHING = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');

const pick = <T>(items: readonly T[], at: number): T | undefined => items[at];

it('keeps an existing Alias Target immutable while accepting Title edits', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(CARD_A, CARD_B),
      fc.oneof(
        fc.constant('Alias'),
        fc
          .string({ minLength: 1, maxLength: 8 })
          .filter((title) => title.trim().length > 0 && title.trim() !== 'Alias'),
      ),
      (target, proposedTitle) => {
        const alternativeTarget = target === CARD_A ? CARD_B : CARD_A;
        const snapshot: SpaceSnapshot = {
          ...start,
          cards: start.cards.map((card) =>
            card.id === CARD_C
              ? { id: CARD_C, document: { title: 'Alias', kind: 'alias', target } }
              : card,
          ),
        };
        const loaded = { snapshot, revision: 0n, exportedRevision: null };
        const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
        const { authoring } = composeApp({
          spaceSession: session,
          selection: OTHER_LAYOUT_ID,
          initialPlacement: null,
        });
        const aliasLayout = snapshot.document.layouts?.find(
          (layout) => layout.id === OTHER_LAYOUT_ID,
        );
        if (aliasLayout === undefined)
          throw new Error('property fixture must include the Alias Layout');
        authoring.replacePlacement(Placement.fromLayout(aliasLayout));

        expect(
          authoring.complete({
            kind: 'edited-card',
            cardId: CARD_C,
            document: { title: proposedTitle, kind: 'alias', target },
          }),
        ).toEqual(proposedTitle === 'Alias' ? { kind: 'unchanged' } : { kind: 'completed' });
        expect(session.getState().working.cards).toContainEqual({
          id: CARD_C,
          document: { title: proposedTitle.trim(), kind: 'alias', target },
        });

        const beforeRetarget = session.getState().working;
        expect(
          authoring.complete({
            kind: 'edited-card',
            cardId: CARD_C,
            document: { title: proposedTitle, kind: 'alias', target: alternativeTarget },
          }),
        ).toEqual({ kind: 'refused', refusal: { code: 'alias-target-immutable' } });
        expect(session.getState().working).toBe(beforeRetarget);
      },
    ),
    { numRuns: 100 },
  );
});

it('keeps the working Space loadable through any sequence of semantic operations', () => {
  fc.assert(
    fc.property(
      fc.array(operation, { minLength: 1, maxLength: 12 }),
      fc.constantFrom<LayoutId>(LAYOUT_ID, OTHER_LAYOUT_ID, LAYOUT_ID),
      (operations, renderer) => {
        const loaded = { snapshot: start, revision: 0n, exportedRevision: null };
        const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
        const { currentSpace, navigation, authoring } = composeApp({
          spaceSession: session,
          selection: renderer,
          // Deterministic, so a shrunk counterexample replays: creating this
          // Space's Layout creation mints one Graph, and the rest of the
          // block is the margin that makes an exhaustion a real signal.
          // These cases install the geometry a renderer would have reported by
          // now, immediately below.
          initialPlacement: null,
        });
        // The authored geometry available when an author reaches these controls.
        const selectedLayout = (): Layout | undefined => {
          const selected = navigation.getState().selectedRenderer;
          return currentSpace().lookup.layout(selected)?.layout;
        };
        const opened = selectedLayout();
        authoring.replacePlacement(
          opened === undefined
            ? Placement.fromEntries([
                [CARD_A, { x: 10, y: 20, open: false }],
                [CARD_B, { x: 300, y: 40, open: false }],
                [CARD_C, { x: 600, y: 40, open: false }],
              ])
            : Placement.fromLayout(opened),
        );

        for (const generated of operations) {
          const space = currentSpace();
          const graphs: readonly Graph[] = selectedLayout()?.graphs ?? space.graphs;
          const completion = resolve(generated, space.cards, graphs);

          const before = session.getState().working;
          const result: AuthoringResult = authoring.complete(completion);

          expect(['completed', 'unchanged', 'refused']).toContain(result.kind);
          if (result.kind === 'refused') {
            expect(result.refusal.code).toEqual(expect.any(String));
            expect(result).not.toHaveProperty('reason');
          }
          if (result.kind !== 'completed') {
            // Not an Edit, so not a change: the identity holds, which is what a
            // surface keeping a draft open over a refusal depends on.
            expect(session.getState().working).toBe(before);
          }
          const reloaded = loadSpaceSnapshot(session.getState().working);
          expect(reloaded.ok).toBe(true);
        }
      },
    ),
    { numRuns: 200 },
  );
});

/** Turn generated indices into the identities the live Space actually holds. */
function resolve(
  generated: GeneratedOperation,
  cards: readonly Card[],
  graphs: readonly Graph[],
): AuthoringCompletion {
  const cardId = uuidSchema.parse(
    'card' in generated ? (pick(cards, generated.card)?.id ?? NOTHING) : NOTHING,
  );
  const graph = 'graph' in generated ? pick(graphs, generated.graph) : undefined;
  const graphId = uuidSchema.parse(graph?.id ?? NOTHING);
  switch (generated.op) {
    case 'edited-card': {
      const card = pick(cards, generated.card);
      if (card === undefined) {
        return {
          kind: 'edited-card',
          cardId,
          document: { title: generated.title, kind: 'markdown', body: '' },
        };
      }
      const { id: _id, ...document } = card;
      const proposedTarget =
        generated.proposedTarget === undefined ? undefined : pick(cards, generated.proposedTarget);
      return {
        kind: 'edited-card',
        cardId: card.id,
        document:
          document.kind === 'alias'
            ? {
                ...document,
                title: generated.title,
                target: uuidSchema.parse(proposedTarget?.id ?? document.target),
              }
            : { ...document, title: generated.title },
      };
    }
    case 'created-card':
      return { kind: 'created-card', anchor: generated.anchor };
    case 'created-alias':
      return { kind: 'created-alias', target: cardId, anchor: generated.anchor };
    case 'added-card-to-layout':
      return { kind: 'added-card-to-layout', cardId, anchor: generated.anchor };
    case 'removed-card-from-layout':
      return { kind: 'removed-card-from-layout', cardId };
    case 'deleted-card':
      return { kind: 'deleted-card', cardId };
    case 'added-graph':
      return { kind: 'added-graph' };
    case 'renamed-graph':
      return { kind: 'renamed-graph', graphId, title: generated.title };
    case 'recolored-graph':
      return { kind: 'recolored-graph', graphId, color: generated.color };
    case 'deleted-graph':
      return { kind: 'deleted-graph', graphId };
    case 'deleted-edge':
      return {
        kind: 'deleted-edge',
        graphId,
        edge: pick(graph?.edges ?? [], generated.edge) ?? { from: NOTHING, to: NOTHING },
      };
    case 'reconnected-edge':
      return {
        kind: 'reconnected-edge',
        graphId,
        edge: pick(graph?.edges ?? [], generated.edge) ?? { from: NOTHING, to: NOTHING },
        endpoint: generated.endpoint,
        cardId,
      };
  }
}
