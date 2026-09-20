import fc from 'fast-check';
import { expect, it } from 'vitest';

import {
  normalizeTitle,
  uuidSchema,
  type Resource,
  type Graph,
  type Map,
  type MapId,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
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
 *    an Edit that would break Map membership, Edge closure, Reference Resource resolution
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
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const RESOURCE_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');

/**
 * Two Maps, a Reference Resource, a Resource one Map omits and a Graph in each — the
 * smallest Space in which every rule under test has something to bite on.
 */
const start: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
          [RESOURCE_B]: { x: 300, y: 40, open: false },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Main', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] },
          { id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: RESOURCE_B, to: RESOURCE_B }] },
        ],
      },
      {
        id: OTHER_MAP_ID,
        title: 'Map 2',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 0, y: 400, open: false },
          [RESOURCE_C]: { x: 0, y: 600, open: false },
        },
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000006'),
            title: 'Elsewhere',
            edges: [{ from: RESOURCE_A, to: RESOURCE_C }],
          },
        ],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: RESOURCE_C, document: { title: 'A again', kind: 'reference', target: RESOURCE_A } },
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
 * `settled-resource-movement` is absent because it carries the moved Resources' own
 * drop points, which only a real pointer gesture produces; its eligibility and
 * derivation are pinned in `space-authoring-operations.test.ts` and
 * `displacement.property.test.ts` against real geometry. The two connect
 * gestures are covered there too, over the Edge-specific fixtures their
 * eligibility rules need.
 */
const operation = fc.oneof(
  fc.record({ op: fc.constant('created-resource' as const), anchor }),
  fc.record({ op: fc.constant('created-reference' as const), resource: index, anchor }),
  /**
   * Resource editing includes attempts to change a Reference Resource's immutable Target. The
   * title is generated blank sometimes on purpose: an empty one must refuse
   * rather than reach intake.
   */
  fc.record({
    op: fc.constant('edited-resource' as const),
    resource: index,
    title: fc.oneof(fc.constant(''), fc.constant('  '), fc.string({ maxLength: 8 })),
    proposedTarget: fc.option(index, { nil: undefined }),
  }),
  fc.record({ op: fc.constant('added-resource-to-map' as const), resource: index, anchor }),
  fc.record({ op: fc.constant('removed-resource-from-map' as const), resource: index }),
  fc.record({ op: fc.constant('deleted-resource' as const), resource: index }),
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
    resource: index,
  }),
);

type GeneratedOperation = ReturnType<typeof operation.generate>['value'];

/** An identity that is nothing, so an out-of-range index still names something. */
const NOTHING = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');

const pick = <T>(items: readonly T[], at: number): T | undefined => items[at];

it('keeps an existing Reference Resource Target immutable while accepting Title edits', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(RESOURCE_A, RESOURCE_B),
      fc.oneof(
        fc.constant('Reference Resource'),
        // Normalized, not trimmed: the write path stores what the schema would
        // mint, and the two disagree about a line's leading whitespace and
        // about trailing whitespace on any line but the last (ADR 0083).
        fc
          .string({ minLength: 1, maxLength: 8 })
          .filter(
            (title) =>
              normalizeTitle(title).length > 0 && normalizeTitle(title) !== 'Reference Resource',
          ),
      ),
      (target, proposedTitle) => {
        const alternativeTarget = target === RESOURCE_A ? RESOURCE_B : RESOURCE_A;
        const snapshot: SpaceSnapshot = {
          ...start,
          resources: start.resources.map((resource) =>
            resource.id === RESOURCE_C
              ? {
                  id: RESOURCE_C,
                  document: { title: 'Reference Resource', kind: 'reference', target },
                }
              : resource,
          ),
        };
        const loaded = { snapshot, revision: 0n, exportedRevision: null };
        const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
        const { authoring } = composeApp({ spaceSession: session, selection: OTHER_MAP_ID });

        expect(
          authoring.complete({
            kind: 'edited-resource',
            resourceId: RESOURCE_C,
            document: { title: proposedTitle, kind: 'reference', target },
          }),
        ).toEqual(
          normalizeTitle(proposedTitle) === 'Reference Resource'
            ? { kind: 'unchanged' }
            : { kind: 'completed' },
        );
        expect(session.getState().working.resources).toContainEqual({
          id: RESOURCE_C,
          document: { title: normalizeTitle(proposedTitle), kind: 'reference', target },
        });

        const beforeRetarget = session.getState().working;
        expect(
          authoring.complete({
            kind: 'edited-resource',
            resourceId: RESOURCE_C,
            document: { title: proposedTitle, kind: 'reference', target: alternativeTarget },
          }),
        ).toEqual({ kind: 'refused', refusal: { code: 'reference-target-immutable' } });
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
      fc.constantFrom<MapId>(MAP_ID, OTHER_MAP_ID, MAP_ID),
      (operations, mapId) => {
        const loaded = { snapshot: start, revision: 0n, exportedRevision: null };
        const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
        const { currentSpace, navigation, authoring } = composeApp({
          spaceSession: session,
          selection: mapId,
        });
        // The authored geometry available when an author reaches these controls.
        const selectedMap = (): Map | undefined => {
          const selected = navigation.getState().selectedMapId;
          return currentSpace().lookup.map(selected)?.map;
        };

        for (const generated of operations) {
          const space = currentSpace();
          const graphs: readonly Graph[] = selectedMap()?.graphs ?? space.graphs;
          const completion = resolve(generated, space.resources, graphs);

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
  resources: readonly Resource[],
  graphs: readonly Graph[],
): AuthoringCompletion {
  const resourceId = uuidSchema.parse(
    'resource' in generated ? (pick(resources, generated.resource)?.id ?? NOTHING) : NOTHING,
  );
  const graph = 'graph' in generated ? pick(graphs, generated.graph) : undefined;
  const graphId = uuidSchema.parse(graph?.id ?? NOTHING);
  switch (generated.op) {
    case 'edited-resource': {
      const resource = pick(resources, generated.resource);
      if (resource === undefined) {
        return {
          kind: 'edited-resource',
          resourceId,
          document: { title: generated.title, kind: 'markdown', body: '' },
        };
      }
      const { id: _id, ...document } = resource;
      const proposedTarget =
        generated.proposedTarget === undefined
          ? undefined
          : pick(resources, generated.proposedTarget);
      return {
        kind: 'edited-resource',
        resourceId: resource.id,
        document:
          document.kind === 'reference'
            ? {
                ...document,
                title: generated.title,
                target: uuidSchema.parse(proposedTarget?.id ?? document.target),
              }
            : { ...document, title: generated.title },
      };
    }
    case 'created-resource':
      return { kind: 'created-resource', anchor: generated.anchor };
    case 'created-reference':
      return { kind: 'created-reference', target: resourceId, anchor: generated.anchor };
    case 'added-resource-to-map':
      return { kind: 'added-resource-to-map', resourceId, anchor: generated.anchor };
    case 'removed-resource-from-map':
      return { kind: 'removed-resource-from-map', resourceId };
    case 'deleted-resource':
      return { kind: 'deleted-resource', resourceId };
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
        resourceId,
      };
  }
}
