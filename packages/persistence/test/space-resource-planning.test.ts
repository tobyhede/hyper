import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { LoadedSpace } from '../src/backend';
import {
  cascadeDeletion,
  initializeTarget,
  planContextDeletion,
  planCreate,
  planDelete,
  planLink,
  precheckContextDeletion,
  refuseBeforeLinking,
  targetSelectionOf,
  type SpaceResourceLifecycleChange,
  type SpaceResourcePlanningView,
  type SpaceResourceRecovery,
} from '../src/space-resource-planning';

const uuid = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`);

/*
 * Space `i` owns Map `mapOf(i)` with Graphs `graphOf(i)` and `secondGraphOf(i)`,
 * and one Space Resource `linkOf(i, j)` per Space `j` it references, each
 * selecting `j`'s Map and first Graph.
 */
const spaceOf = (i: number): UUID => uuid(0x100 + i);
const mapOf = (i: number): UUID => uuid(0x200 + i);
const secondMapOf = (i: number): UUID => uuid(0x280 + i);
const graphOf = (i: number): UUID => uuid(0x300 + i);
const secondGraphOf = (i: number): UUID => uuid(0x380 + i);
const linkOf = (i: number, j: number): UUID => uuid(0x1000 + i * 64 + j);
const META = spaceOf(0);

const space = (
  i: number,
  links: readonly number[],
  { secondMap = false }: { readonly secondMap?: boolean } = {},
): SpaceSnapshot => ({
  id: spaceOf(i),
  document: {
    version: 1,
    title: `Space ${i}`,
    defaultMap: mapOf(i),
    maps: [
      {
        id: mapOf(i),
        title: 'Map 1',
        kind: 'positioned',
        positions: Object.fromEntries(
          links.map((j, index) => [linkOf(i, j), { x: index * 300, y: 0, open: false }]),
        ),
        graphs: [
          { id: graphOf(i), title: 'Graph 1', edges: [] },
          { id: secondGraphOf(i), title: 'Graph 2', edges: [] },
        ],
        activeGraph: graphOf(i),
      },
      ...(secondMap
        ? [
            {
              id: secondMapOf(i),
              title: 'Map 2',
              kind: 'positioned' as const,
              positions: {},
              graphs: [{ id: uuid(0x400 + i), title: 'Graph 1', edges: [] }],
              activeGraph: uuid(0x400 + i),
            },
          ]
        : []),
    ],
  },
  resources: links.map((j) => ({
    id: linkOf(i, j),
    document: {
      title: `Space ${j}`,
      kind: 'space' as const,
      spaceId: spaceOf(j),
      map: mapOf(j),
      graph: graphOf(j),
    },
  })),
});

const loaded = (snapshot: SpaceSnapshot): LoadedSpace => ({
  snapshot,
  revision: 1n,
  exportedRevision: null,
});

const view = (
  stored: readonly SpaceSnapshot[],
  {
    live = [META],
    recovery = [],
    working = [],
  }: {
    readonly live?: readonly UUID[];
    readonly recovery?: readonly (readonly [UUID, SpaceResourceRecovery])[];
    readonly working?: readonly SpaceSnapshot[];
  } = {},
): SpaceResourcePlanningView => {
  const spaces = new Map(stored.map((snapshot) => [snapshot.id, snapshot]));
  for (const snapshot of working) spaces.set(snapshot.id, snapshot);
  return {
    spaces,
    aggregate: { metaSpaceId: META, spaces: stored.map(loaded) },
    live: new Set(live),
    recovery: new Map(recovery),
  };
};

const input = { containingSpaceId: META, mapId: mapOf(0), title: 'New', position: { x: 0, y: 0 } };

describe('targetSelectionOf', () => {
  it('reads the Map a Space opens on and its Active Graph', () => {
    expect(targetSelectionOf(space(1, []))).toEqual({
      kind: 'selected',
      selection: { map: mapOf(1), graph: graphOf(1) },
    });
  });

  it('names why a target supplies no selection', () => {
    const { defaultMap: _defaultMap, maps: _maps, ...mapless } = space(1, []).document;
    expect(targetSelectionOf(undefined)).toEqual({ kind: 'unavailable', reason: 'missing' });
    expect(targetSelectionOf({ ...space(1, []), document: mapless })).toEqual({
      kind: 'unavailable',
      reason: 'not-initialized',
    });
    expect(
      targetSelectionOf({
        ...space(1, []),
        document: { ...space(1, []).document, defaultMap: uuid(0xdead) },
      }),
    ).toEqual({ kind: 'unavailable', reason: 'unreadable' });
  });
});

describe('refuseBeforeLinking', () => {
  const working = (id: UUID): SpaceSnapshot => (id === META ? space(0, []) : space(1, []));

  it('refuses on the containing Space before its Map or the target', () => {
    expect(
      refuseBeforeLinking(
        new Map([
          [META, 'retry'],
          [spaceOf(1), 'resolve-conflict'],
        ]),
        working,
        { ...input, mapId: uuid(0xdead), targetSpaceId: spaceOf(1) },
      ),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: META, recovery: 'retry' },
    });
  });

  it('refuses a missing containing Map before a target needing recovery', () => {
    expect(
      refuseBeforeLinking(new Map([[spaceOf(1), 'retry']]), working, {
        ...input,
        mapId: uuid(0xdead),
        targetSpaceId: spaceOf(1),
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'map-not-found', mapId: uuid(0xdead) } });
  });

  it('refuses a target needing recovery, and nothing otherwise', () => {
    const link = { ...input, targetSpaceId: spaceOf(1) };
    expect(refuseBeforeLinking(new Map([[spaceOf(1), 'resolve-conflict']]), working, link)).toEqual(
      {
        kind: 'refused',
        refusal: {
          code: 'persistence-recovery-required',
          spaceId: spaceOf(1),
          recovery: 'resolve-conflict',
        },
      },
    );
    expect(refuseBeforeLinking(new Map(), working, link)).toBeUndefined();
  });
});

describe('planCreate', () => {
  const ids = (values: readonly UUID[]) => {
    const remaining = [...values];
    return () => {
      const id = remaining.shift();
      if (id === undefined) throw new Error('exhausted');
      return id;
    };
  };

  it('creates the target Space and a Space Resource selecting what it opens on', () => {
    const target = initializeTarget('New', ids([spaceOf(5), uuid(0x501), mapOf(5), graphOf(5)]));
    const outcome = planCreate(view([space(0, [])]), input, {
      ...target,
      resourceId: linkOf(0, 5),
    });

    expect(target.selection).toEqual({ map: mapOf(5), graph: graphOf(5) });
    expect(outcome).toMatchObject({
      kind: 'changes',
      open: [],
      completion: linkOf(0, 5),
      changes: [
        { kind: 'update', spaceId: META },
        { kind: 'create', snapshot: { id: spaceOf(5) } },
      ],
    });
    if (outcome.kind !== 'changes') throw new Error('expected changes');
    expect(outcome.changes[0]).toMatchObject({
      snapshot: {
        resources: [
          {
            id: linkOf(0, 5),
            document: { kind: 'space', spaceId: spaceOf(5), map: mapOf(5), graph: graphOf(5) },
          },
        ],
      },
    });
  });

  it('refuses when the containing Map is gone from what the plan reads', () => {
    const target = initializeTarget('New', ids([spaceOf(5), uuid(0x501), mapOf(5), graphOf(5)]));
    expect(
      planCreate(
        view([space(0, [])]),
        { ...input, mapId: uuid(0xdead) },
        {
          ...target,
          resourceId: linkOf(0, 5),
        },
      ),
    ).toEqual({ kind: 'refused', refusal: { code: 'map-not-found', mapId: uuid(0xdead) } });
  });
});

describe('planLink', () => {
  it('records the selection the target stores, not its working Space', () => {
    const workingTarget: SpaceSnapshot = {
      ...space(1, []),
      document: { ...space(1, []).document, defaultMap: uuid(0xdead) },
    };
    const outcome = planLink(
      view([space(0, []), space(1, [])], { working: [workingTarget] }),
      { ...input, targetSpaceId: spaceOf(1) },
      linkOf(0, 1),
    );

    expect(outcome).toMatchObject({ kind: 'changes', completion: linkOf(0, 1) });
    if (outcome.kind !== 'changes') throw new Error('expected changes');
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      snapshot: { resources: [{ document: { map: mapOf(1), graph: graphOf(1) } }] },
    });
  });

  it('refuses a target the aggregate no longer holds', () => {
    expect(
      planLink(view([space(0, [])]), { ...input, targetSpaceId: spaceOf(1) }, linkOf(0, 1)),
    ).toEqual({
      kind: 'refused',
      refusal: {
        code: 'space-resource-target-unavailable',
        spaceId: spaceOf(1),
        reason: 'missing',
      },
    });
  });
});

describe('planDelete', () => {
  it('refuses a Resource that is not a Space Resource', () => {
    expect(
      planDelete(view([space(0, [])]), { containingSpaceId: META, resourceId: uuid(0xdead) }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'space-resource-not-found', resourceId: uuid(0xdead) },
    });
  });

  it('cascades to every Space the removal leaves unreferenced and opens the stored ones', () => {
    const stored = [space(0, [1, 3]), space(1, [2]), space(2, []), space(3, [2])];
    const outcome = planDelete(view(stored, { live: [META, spaceOf(1)] }), {
      containingSpaceId: META,
      resourceId: linkOf(0, 1),
    });

    // Space 2 is still referenced by Space 3, so only Space 1 goes.
    expect(outcome).toMatchObject({
      kind: 'changes',
      changes: [
        { kind: 'update', spaceId: META },
        { kind: 'delete', spaceId: spaceOf(1) },
      ],
      open: [],
    });

    const alone = planDelete(view([space(0, [1]), space(1, [2]), space(2, [])]), {
      containingSpaceId: META,
      resourceId: linkOf(0, 1),
    });
    expect(alone).toMatchObject({
      changes: [
        { kind: 'update', spaceId: META },
        { kind: 'delete', spaceId: spaceOf(1) },
        { kind: 'delete', spaceId: spaceOf(2) },
      ],
      open: [{ snapshot: { id: spaceOf(1) } }, { snapshot: { id: spaceOf(2) } }],
    });
  });

  it('refuses when a cascaded Space needs recovery', () => {
    expect(
      planDelete(
        view([space(0, [1]), space(1, [])], {
          live: [META, spaceOf(1)],
          recovery: [[spaceOf(1), 'retry']],
        }),
        { containingSpaceId: META, resourceId: linkOf(0, 1) },
      ),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: spaceOf(1), recovery: 'retry' },
    });
  });

  it('refuses when a Space needing recovery still references a cascaded Space in its working Space', () => {
    // Space 2 stores no reference, but its failed working Space added one.
    expect(
      planDelete(
        view([space(0, [1, 2]), space(1, []), space(2, [])], {
          live: [META, spaceOf(2)],
          recovery: [[spaceOf(2), 'retry']],
          working: [space(2, [1])],
        }),
        { containingSpaceId: META, resourceId: linkOf(0, 1) },
      ),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: spaceOf(2), recovery: 'retry' },
    });
  });

  it('never cascades to the Meta Space', () => {
    expect(cascadeDeletion(view([space(0, [])]).aggregate, space(1, []), META)).toEqual([]);
  });
});

/*
 * An aggregate as the lifecycle builds one: every ordinary Space was created or
 * linked from a Space made before it, so references run from lower to higher
 * index and each ordinary Space has at least one.
 */
const lifecycleAggregates = fc.integer({ min: 2, max: 7 }).chain((count) =>
  fc
    .tuple(
      ...Array.from({ length: count - 1 }, (_, index) =>
        fc.uniqueArray(fc.integer({ min: 0, max: index }), { minLength: 1, maxLength: index + 1 }),
      ),
    )
    .chain((referrers) => {
      const links = Array.from({ length: count }, (): number[] => []);
      referrers.forEach((from, index) => {
        for (const i of from) links[i]?.push(index + 1);
      });
      const edges = links.flatMap((targets, i) => targets.map((j) => [i, j] as const));
      return fc.record({
        links: fc.constant(links),
        deleted: fc.constantFrom(...edges),
      });
    }),
);

const spaceResourceTargets = (snapshot: SpaceSnapshot): UUID[] =>
  snapshot.resources.flatMap(({ document }) =>
    document.kind === 'space' ? [document.spaceId] : [],
  );

describe('planDelete over any lifecycle-built aggregate', () => {
  it('leaves no Space Resource dangling and no ordinary Space unreferenced', () => {
    fc.assert(
      fc.property(lifecycleAggregates, ({ links, deleted: [from, to] }) => {
        const stored = links.map((targets, i) => space(i, targets));
        const outcome = planDelete(view(stored, { live: [spaceOf(from)] }), {
          containingSpaceId: spaceOf(from),
          resourceId: linkOf(from, to),
        });
        if (outcome.kind !== 'changes') throw new Error(`planned ${outcome.kind}`);

        const [edit, ...rest] = outcome.changes;
        const deletedIds = new Set(
          rest.map((change: SpaceResourceLifecycleChange) => {
            if (change.kind !== 'delete') throw new Error('only the containing Space is updated');
            return change.spaceId;
          }),
        );
        if (edit.kind !== 'update') throw new Error('the containing Space is updated first');
        const remaining = stored
          .filter(({ id }) => !deletedIds.has(id))
          .map((snapshot) => (snapshot.id === edit.spaceId ? edit.snapshot : snapshot));

        expect(deletedIds.has(META)).toBe(false);
        expect(deletedIds.has(spaceOf(from))).toBe(false);
        const referenced = new Set(remaining.flatMap(spaceResourceTargets));
        for (const target of referenced) expect(deletedIds.has(target)).toBe(false);
        for (const { id } of remaining) {
          if (id !== META) expect(referenced.has(id)).toBe(true);
        }
        expect(outcome.open.map(({ snapshot }) => snapshot.id)).toEqual([...deletedIds]);
      }),
    );
  });
});

describe('planContextDeletion', () => {
  const deleteMap = { targetSpaceId: spaceOf(1), mapId: mapOf(1), preferredMapId: null };

  it('is unchanged before any read when the Map is the last one', () => {
    expect(precheckContextDeletion(new Map(), () => space(1, []), deleteMap)).toEqual({
      kind: 'unchanged',
    });
    expect(
      precheckContextDeletion(new Map(), () => space(1, [], { secondMap: true }), deleteMap),
    ).toEqual({ kind: 'proceed' });
  });

  it('moves every Space Resource selecting a deleted Map to the successor, and the default with it', () => {
    const stored = [space(0, [1]), space(1, [], { secondMap: true }), space(2, [1])];
    const outcome = planContextDeletion(view(stored, { live: [META, spaceOf(1)] }), deleteMap);

    expect(outcome).toMatchObject({
      kind: 'changes',
      completion: { mapId: secondMapOf(1), graphId: uuid(0x401) },
      open: [{ snapshot: { id: spaceOf(2) } }],
      changes: [
        {
          kind: 'update',
          spaceId: spaceOf(1),
          snapshot: { document: { defaultMap: secondMapOf(1), maps: [{ id: secondMapOf(1) }] } },
        },
        {
          kind: 'update',
          spaceId: META,
          snapshot: { resources: [{ document: { map: secondMapOf(1), graph: uuid(0x401) } }] },
        },
        {
          kind: 'update',
          spaceId: spaceOf(2),
          snapshot: { resources: [{ document: { map: secondMapOf(1), graph: uuid(0x401) } }] },
        },
      ],
    });
  });

  it('prefers the named Graph and moves the Active Graph off the deleted one', () => {
    const outcome = planContextDeletion(view([space(0, [1]), space(1, [])]), {
      targetSpaceId: spaceOf(1),
      mapId: mapOf(1),
      graphId: graphOf(1),
      preferredGraphId: secondGraphOf(1),
    });

    expect(outcome).toMatchObject({
      kind: 'changes',
      completion: { mapId: mapOf(1), graphId: secondGraphOf(1) },
      changes: [
        {
          spaceId: spaceOf(1),
          snapshot: {
            document: {
              maps: [{ activeGraph: secondGraphOf(1), graphs: [{ id: secondGraphOf(1) }] }],
            },
          },
        },
        { spaceId: META, snapshot: { resources: [{ document: { graph: secondGraphOf(1) } }] } },
      ],
    });
  });

  it('refuses before opening anything when a participant needs recovery', () => {
    expect(
      planContextDeletion(
        view([space(0, [1]), space(1, [], { secondMap: true }), space(2, [1])], {
          live: [META, spaceOf(1)],
          recovery: [[META, 'resolve-conflict']],
        }),
        deleteMap,
      ),
    ).toEqual({
      kind: 'refused',
      refusal: {
        code: 'persistence-recovery-required',
        spaceId: META,
        recovery: 'resolve-conflict',
      },
    });
  });

  it('is unchanged when what the plan reads leaves no successor', () => {
    expect(planContextDeletion(view([space(0, [1]), space(1, [])]), deleteMap)).toEqual({
      kind: 'unchanged',
    });
  });
});
