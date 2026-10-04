import fc from 'fast-check';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource, type UUID } from '@project/core';
import {
  buildGraphRenderEdges,
  loadSpace,
  serializeResourceFile,
  type LayoutStrategyGraph,
  type ResourceFile,
} from '@project/graph';
import { projectResourceNodes, projectGraphEdges } from '../src/index';
import { resourceFile } from './resource-files';

/**
 * The projection's handle invariants, as properties rather than examples.
 *
 * React Flow warning #008 — "Couldn't create edge for source/target handle id" —
 * fires when an Edge names a handle that does not resolve on the node it points
 * at, and warning or not, `getEdgePosition` then answers null and the Edge is
 * not drawn at all. That condition is fully determined by what
 * `projectResourceNodes` and `projectGraphEdges` produce *together*. Each
 * projection is well covered on its own in `projection.test.ts`; nothing there
 * asserts the relationship, so a change to one side only would pass every test
 * and render a Graph with no Edges.
 *
 * An Edge names no handle and attaches to one of four anchors
 * chosen while it is drawn, so what has to hold is that **every** Resource an Edge
 * reaches carries those anchors — not that some named handle happens to exist.
 * React Flow resolves an unnamed handle to the first of the node's bounds of
 * that kind, so a Resource missing either kind is an Edge that silently vanishes.
 *
 * Properties rather than examples because the failure mode is multi-graph: the
 * generated Spaces overlap on Resources, which is the shape that would put
 * several same-side handles on one node if anchors were minted per Edge.
 */

/** Ids from a shared pool, so generated graphs overlap on resources — the case that
 *  would put several same-side handles on one node. */
const resourceIdPool = fc
  .uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 2, maxLength: 8 })
  .map((ns) => ns.map(uuidFrom));

function uuidFrom(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/**
 * A space file whose graphs each run over distinct resources in some order: a chain
 * through all of them, plus up to three **shortcuts** skipping ahead. Every edge
 * points forward in that order and each exact Edge appears once, so `loadSpace`
 * always accepts what we generate; resources are the union of what the graphs
 * touch, so there are no orphans either.
 *
 * The shortcuts are the point. They fork a resource and merge into a later one,
 * which is the shape a step list could not express and the one that puts several
 * edges on a single handle.
 */
const graphArb = (pool: string[]) =>
  fc
    .tuple(
      fc.shuffledSubarray(pool, { minLength: 2 }),
      fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 3 }),
    )
    .map(([resources, shortcuts]) => {
      const edges = resources.slice(0, -1).map((from, i) => ({ from, to: resources[i + 1]! }));
      for (const [rawFrom, rawSkip] of shortcuts) {
        const from = rawFrom % resources.length;
        const to = from + 2 + (rawSkip % resources.length);
        const edge = { from: resources[from]!, to: resources[to]! };
        if (
          to < resources.length &&
          !edges.some((candidate) => candidate.from === edge.from && candidate.to === edge.to)
        ) {
          edges.push(edge);
        }
      }
      return { resources, edges };
    });

const spaceFileArb = resourceIdPool.chain((pool) =>
  fc.array(graphArb(pool), { minLength: 1, maxLength: 4 }).map((graphs) => {
    const visited = [...new Set(graphs.flatMap((r) => r.resources))];
    return {
      // One map owning every generated graph, taking membership of every resource
      // they touch: a graph is an owned value of its map (ADR 0040) and its
      // edges are closed over that map's members.
      file: {
        version: 1,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Generated',
        maps: [
          {
            id: '00000000-0000-4000-8000-000000000050',
            title: 'Only map',
            kind: 'positioned',
            positions: Object.fromEntries(
              visited.map((id, index) => [id, { x: index * 300, y: 0, open: false }]),
            ),
            graphs: graphs.map((graph, index) => ({
              id: uuidFrom(index + 100),
              title: `Graph ${index}`,
              edges: graph.edges,
            })),
          },
        ],
      },
      resourceFiles: visited.map((id) => resourceFile(id)),
    };
  }),
);

/**
 * Project a generated Space to React Flow nodes and Edges. Colors are irrelevant
 * to these invariants, so the fallback is fine.
 *
 * A strategy graph is supplied because a Resource declares its anchors only once
 * something has placed it — before that React Flow measures the DOM instead,
 * which is not what these properties are about.
 */
function project(generated: { file: unknown; resourceFiles: ResourceFile[] }) {
  const result = loadSpace(generated.file, generated.resourceFiles);
  if (!result.ok) throw new Error(`generated space should load: ${JSON.stringify(result.errors)}`);
  const space = result.space;
  const strategyGraph: LayoutStrategyGraph = {
    resources: space.resources.map((resource, index) => ({
      id: resource.id,
      width: 260,
      height: 146,
      x: index * 400,
      y: 0,
    })),
    edges: [],
  };

  return {
    nodes: projectResourceNodes(space, { strategyGraph }),
    edges: projectGraphEdges(buildGraphRenderEdges(space), {}),
  };
}

describe('projection handle invariants', () => {
  const SIDES = new Set([Position.Top, Position.Right, Position.Bottom, Position.Left]);

  it('declares the four anchors of each role on every Resource an Edge reaches', () => {
    fc.assert(
      fc.property(spaceFileArb, (generated) => {
        const { nodes, edges } = project(generated);

        // Not vacuous: every generated Graph carries at least one Edge.
        expect(edges.length).toBeGreaterThan(0);

        const declared = new Map(nodes.map((node) => [node.id, node.handles ?? []]));

        for (const edge of edges) {
          for (const [role, resourceId] of [
            ['source', edge.source],
            ['target', edge.target],
          ] as const) {
            const handles = declared.get(resourceId);
            expect(handles, `edge ${edge.id} has no ${role} node`).toBeDefined();
            const sides = (handles ?? [])
              .filter((handle) => handle.type === role)
              .map((handle) => handle.position);
            expect(new Set(sides), `edge ${edge.id} ${role} anchors`).toEqual(SIDES);
          }
        }
      }),
    );
  });

  it('leaves an Edge naming no handle at all', () => {
    fc.assert(
      fc.property(spaceFileArb, (generated) => {
        const { edges } = project(generated);

        // The projection does not run again during a drag, so a side chosen here
        // would be right only once the gesture settled (ADR 0087). Leaving both
        // unnamed is what hands the choice to the Edge, which is the one role
        // that can follow the drag.
        for (const edge of edges) {
          expect(edge.sourceHandle, `edge ${edge.id} source handle`).toBeUndefined();
          expect(edge.targetHandle, `edge ${edge.id} target handle`).toBeUndefined();
        }
      }),
    );
  });

  it('gives a Resource no two handles of one kind on one side', () => {
    fc.assert(
      fc.property(spaceFileArb, (generated) => {
        const { nodes } = project(generated);

        // React Flow cannot tell two same-kind handles apart otherwise, and picks
        // whichever it finds first. Four anchors named for their sides satisfy
        // that by construction.
        for (const node of nodes) {
          const seen = (node.handles ?? []).map((handle) => `${handle.type}-${handle.position}`);
          expect(new Set(seen).size, `${node.id} handles`).toBe(seen.length);
        }
      }),
    );
  });
});

type GeneratedKind = Resource['kind'];

/**
 * A generated Space with each Resource given a kind. A Reference Resource
 * targets an earlier Resource that owns content, since intake refuses a
 * Reference Resource to a Reference Resource; with none yet, it is Markdown. A
 * Space Resource targets a Space other than the one it is in.
 */
function withKinds(
  generated: { file: unknown; resourceFiles: ResourceFile[] },
  kinds: readonly GeneratedKind[],
) {
  const owners: UUID[] = [];
  const resourceFiles = generated.resourceFiles.map((file, index): ResourceFile => {
    const id = uuidSchema.parse(file.path.slice('resources/'.length, -'.md'.length));
    const title = `Resource ${index}`;
    const chosen = kinds[index % kinds.length] ?? 'markdown';
    const target = owners[index % Math.max(owners.length, 1)];
    const resource: Resource =
      chosen === 'reference' && target !== undefined
        ? { id, title, kind: 'reference', target }
        : chosen === 'image'
          ? { id, title, kind: 'image', url: `https://example.com/${index}.png` }
          : chosen === 'space'
            ? {
                id,
                title,
                kind: 'space',
                spaceId: uuidSchema.parse(uuidFrom(900)),
                map: uuidSchema.parse(uuidFrom(901)),
                graph: uuidSchema.parse(uuidFrom(902)),
              }
            : chosen === 'ur'
              ? { id, title, kind: 'ur' }
              : { id, title, kind: 'markdown', body: `Body ${index}\n` };
    if (resource.kind !== 'reference') owners.push(id);
    return { path: file.path, text: serializeResourceFile(resource) };
  });
  return { file: generated.file, resourceFiles };
}

const kindsArb = fc.array(
  fc.constantFrom<GeneratedKind>('markdown', 'image', 'space', 'ur', 'reference'),
  { minLength: 1, maxLength: 8 },
);

describe('what each node shows', () => {
  /**
   * A Resource's own content is of its own kind: the display and the kind the
   * front is chosen by are made from one Resource, so they cannot disagree for
   * content that is the Resource's own.
   */
  it('draws content of the node’s own kind whenever the content is its own', () => {
    fc.assert(
      fc.property(spaceFileArb, kindsArb, (generated, kinds) => {
        const kinded = withKinds(generated, kinds);
        const result = loadSpace(kinded.file, kinded.resourceFiles);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const space = result.space;
        const nodes = projectResourceNodes(space, {
          openResourceIds: new Set(space.resources.map((resource) => resource.id)),
        });

        for (const node of nodes) {
          const { display } = node.data;
          if (display.shown === 'closed') throw new Error('an Open Resource was drawn Closed');
          if (display.content.via === 'self') expect(display.content.kind).toBe(node.data.kind);
        }
      }),
    );
  });

  /**
   * Presenting over Open is decided once, in the projection: a Resource both
   * presented and Open is presented, and keeps its authored Open state, which
   * is geometry rather than what it draws.
   */
  it('shows the presented Resource as presented, the Open ones as open, and the rest Closed', () => {
    fc.assert(
      fc.property(
        spaceFileArb,
        fc.array(fc.boolean(), { minLength: 1 }),
        fc.nat(),
        (generated, openings, presentedIndex) => {
          const result = loadSpace(generated.file, generated.resourceFiles);
          if (!result.ok) throw new Error(JSON.stringify(result.errors));
          const space = result.space;
          const ids = space.resources.map((resource) => resource.id);
          const openIds = new Set(ids.filter((_, index) => openings[index % openings.length]));
          const presented = ids[presentedIndex % ids.length];
          const nodes = projectResourceNodes(space, {
            openResourceIds: openIds,
            activeResourceId: presented ?? null,
            showActiveResourceContent: true,
          });

          for (const node of nodes) {
            const open = openIds.has(node.data.resourceId);
            const expected =
              node.data.resourceId === presented ? 'presented' : open ? 'open' : 'closed';
            expect(node.data.display.shown).toBe(expected);
            expect(node.data.open === true).toBe(open);
          }
        },
      ),
    );
  });
});
