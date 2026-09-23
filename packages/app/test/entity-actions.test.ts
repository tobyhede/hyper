import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Resource, type Graph, type Map } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { EntityActionGroup } from '@project/ui';
import { spaceEntityActions, type SpaceEntity } from '../src/entity-actions';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const PLACED_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OUTSIDE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const REFERENCE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const REFERENCE_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

const GRAPH: Graph = { id: GRAPH_ID, title: 'Long', edges: [] };
const MAP: Map = {
  id: MAP_ID,
  title: 'Collection 1',
  kind: 'positioned',
  positions: { [PLACED_RESOURCE_ID]: { x: 0, y: 0, open: false } },
  graphs: [GRAPH],
};
const resource = (id: Resource['id'], title: string): Resource => ({
  id,
  title,
  kind: 'markdown',
  body: '',
});

const spaceResource = (id: typeof PLACED_RESOURCE_ID, title: string): Resource => ({
  id,
  title,
  kind: 'space',
  spaceId: TARGET_SPACE_ID,
  map: TARGET_MAP_ID,
  graph: TARGET_GRAPH_ID,
});

const referenceResource = (
  id: Resource['id'],
  title: string,
  target: Resource['id'],
): Resource => ({
  id,
  title,
  kind: 'reference',
  target,
});

const build = (
  overrides: Partial<Parameters<typeof spaceEntityActions>[0]> = {},
): ((entity: SpaceEntity) => readonly EntityActionGroup[]) =>
  spaceEntityActions({
    spaceId: SPACE_ID,
    spaceTitle: 'Fixture Space',
    onCopy: vi.fn(),
    onOpenIndependently: vi.fn(),
    onRename: vi.fn(),
    ...overrides,
  });

/** Every command a menu holds, flattened past the grouping. */
const commands = (groups: readonly EntityActionGroup[]) => groups.flat();
const labels = (groups: readonly EntityActionGroup[]) =>
  commands(groups).map((action) => action.label);

/** The destination one command would copy, taken from the callback it fires. */
const copied = (
  entity: SpaceEntity,
  label: string,
): ProductDestination | 'no such command' | 'copied nothing' => {
  const captured: ProductDestination[] = [];
  const actions = build({
    onCopy: (chosen) => {
      captured.push(chosen);
      return true;
    },
  })(entity);
  const action = commands(actions).find((candidate) => candidate.label === label);
  if (action === undefined) return 'no such command';
  // The command is awaited nowhere here: what is being read is which
  // destination it hands `onCopy`, and that happens on the call. What it
  // answers afterwards is `EntityActionsMenu`'s business and is proved there.
  void action.onSelect();
  return captured[0] ?? 'copied nothing';
};

describe('spaceEntityActions', () => {
  /**
   * The one naming rule the product copy has (`.scratch/link-ux/issues/01`,
   * Terminology): neither word reaches a reader. They are fine in a prop name
   * and in this repository's prose; they are domain vocabulary, and the menu is
   * read by someone who does not have it.
   */
  it.each([
    { name: 'a Space', entity: { kind: 'space' } as const },
    { name: 'a Map', entity: { kind: 'map', map: MAP } as const },
    { name: 'a Graph', entity: { kind: 'graph', graph: GRAPH, map: MAP } as const },
    {
      name: 'a Resource',
      entity: { kind: 'resource', resource: resource(PLACED_RESOURCE_ID, 'A'), map: MAP } as const,
    },
    {
      name: 'a Space Resource',
      entity: {
        kind: 'resource',
        resource: spaceResource(PLACED_RESOURCE_ID, 'Architecture'),
        map: MAP,
      } as const,
    },
  ])('never says canonical or contextual in $name’s menu', ({ entity }) => {
    const written = commands(build()(entity))
      .flatMap((action) => [action.label, action.description ?? '', action.report?.done ?? ''])
      .join(' ')
      .toLowerCase();

    expect(written).not.toContain('canonical');
    expect(written).not.toContain('contextual');
  });

  it('offers a Space one address and no rename', () => {
    const groups = build()({ kind: 'space' });

    expect(labels(groups)).toEqual(['Copy link']);
    expect(copied({ kind: 'space' }, 'Copy link')).toEqual({ kind: 'space', spaceId: SPACE_ID });
  });

  /**
   * No Delete: a Map is deleted through Map authoring
   * (`map-authoring-commands.ts`), which owns the last-Map rule and the
   * survivor, and the Dock and the rail each draw it from that capability.
   */
  it('offers a Map its rename and its address', () => {
    const entity: SpaceEntity = { kind: 'map', map: MAP };
    const groups = build()(entity);

    expect(labels(groups)).toEqual(['Rename', 'Copy link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'map',
      spaceId: SPACE_ID,
      mapId: MAP_ID,
    });
  });

  /**
   * A withheld command is absent, never present and disabled — the rule the
   * Sidebar's link buttons already followed, applied to the Edits as well.
   */
  it('withholds the Map rename rather than offering it refused', () => {
    const groups = build({ onRename: null })({
      kind: 'map',
      map: MAP,
    });

    expect(labels(groups)).toEqual(['Copy link']);
  });

  /**
   * A Map owns its Graphs (ADR 0040), so a Graph row always has the
   * address within the Map drawing it. A Graph's own permanent address is
   * no longer offered from any menu (`.scratch/dock-menu-reorganisation/issues/01`).
   */
  it('offers a Graph its within-Map address and no permanent one', () => {
    const entity: SpaceEntity = { kind: 'graph', graph: GRAPH, map: MAP };

    expect(labels(build()(entity))).toEqual(['Rename', 'Copy link']);
    expect(copied(entity, 'Copy link')).toEqual({
      kind: 'map-graph',
      spaceId: SPACE_ID,
      mapId: MAP_ID,
      graphId: GRAPH_ID,
    });
  });

  it('offers a placed Resource both link forms and no rename', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: resource(PLACED_RESOURCE_ID, 'A'),
      map: MAP,
    };

    expect(labels(build()(entity))).toEqual([
      'Copy link to Resource in Map',
      'Copy link to Resource',
    ]);
    expect(copied(entity, 'Copy link to Resource in Map')).toEqual({
      kind: 'map-resource',
      spaceId: SPACE_ID,
      mapId: MAP_ID,
      resourceId: PLACED_RESOURCE_ID,
    });
  });

  /**
   * A menu row refers to a Resource, so its sentence names the Resource's **name**
   * (ADR 0083). The description is one line of prose beneath a label, and a
   * Title's later lines reaching it would break the sentence in half.
   */
  it('uses concise copy labels without description text', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: resource(PLACED_RESOURCE_ID, 'Auth\nHow a session begins'),
      map: MAP,
    };

    const written = commands(build()(entity))
      .map((action) => action.description ?? '')
      .join(' ');

    expect(written.trim()).toBe('');
    expect(written).not.toContain('How a session begins');
  });

  /**
   * A Resource the Resources list reveals but this Map does not place has one
   * address, so there is nothing for a second to differ from. Offering it
   * anyway would copy a `map-resource` path the host answers 404 for.
   */
  it('withholds the permanent link from a Resource this Map does not place', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: resource(OUTSIDE_RESOURCE_ID, 'Outside'),
      map: MAP,
    };

    expect(labels(build()(entity))).toEqual(['Copy link to Resource']);
    expect(copied(entity, 'Copy link to Resource')).toEqual({
      kind: 'resource',
      spaceId: SPACE_ID,
      resourceId: OUTSIDE_RESOURCE_ID,
    });
  });

  /** Every address command confirms in place, which is what holds the menu open. */
  it('confirms every copy without a subtitle', () => {
    const copies = commands(
      build()({ kind: 'resource', resource: resource(PLACED_RESOURCE_ID, 'A'), map: MAP }),
    ).filter((action) => action.label.startsWith('Copy'));

    expect(copies).toHaveLength(2);
    for (const action of copies) {
      expect(action.report?.done).toBe('Copied');
      expect(action.description).toBeUndefined();
      expect(action.icon).toBeDefined();
    }
  });

  /**
   * A Space Resource's own addresses still name the Resource. Independently opening
   * the Space it shows is a third destination: the target's own address, with
   * no containing Map or presentation (ADR 0068, ADR 0069).
   */
  it('offers a Space Resource the target Space’s own address and an independent open', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: spaceResource(PLACED_RESOURCE_ID, 'Architecture'),
      map: MAP,
    };

    expect(labels(build()(entity))).toEqual([
      'Copy link to Resource in Map',
      'Copy link to Resource',
      'Copy link to Space',
      'Open in New Tab',
    ]);
    expect(copied(entity, 'Copy link to Resource in Map')).toEqual({
      kind: 'map-resource',
      spaceId: SPACE_ID,
      mapId: MAP_ID,
      resourceId: PLACED_RESOURCE_ID,
    });
    expect(copied(entity, 'Copy link to Space')).toEqual({
      kind: 'space',
      spaceId: TARGET_SPACE_ID,
    });
  });

  it('opens the target Space independently from a Space Resource, not the Resource', async () => {
    const opened: ProductDestination[] = [];
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: spaceResource(PLACED_RESOURCE_ID, 'Architecture'),
      map: MAP,
    };
    const actions = build({
      onOpenIndependently: (destination) => {
        opened.push(destination);
        return true;
      },
    })(entity);
    const action = commands(actions).find((candidate) => candidate.label === 'Open in New Tab');

    expect(action).toBeDefined();
    expect(await action?.onSelect()).toBe('done');
    expect(opened).toEqual([{ kind: 'space', spaceId: TARGET_SPACE_ID }]);
  });

  /**
   * A Reference Resource's own two addresses still name the Reference Resource itself.
   * Copy link to Target is a third row naming the Target's own Resource address —
   * never a within-Map one, because the Target is often not on this
   * Map at all (`.scratch/reference-thing/issues/02`).
   */
  it('offers a Reference Resource a Copy link to Target alongside its own addresses', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: referenceResource(REFERENCE_RESOURCE_ID, 'A reference', REFERENCE_TARGET_ID),
      map: MAP,
    };

    expect(labels(build()(entity))).toEqual(['Copy link to Resource', 'Copy link to Target']);
    expect(copied(entity, 'Copy link to Target')).toEqual({
      kind: 'resource',
      spaceId: SPACE_ID,
      resourceId: REFERENCE_TARGET_ID,
    });
  });

  /** No "in this Map" form for the Target: one row, the Target's own address. */
  it('offers Copy link to Target only once, never a within-Map form', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: referenceResource(REFERENCE_RESOURCE_ID, 'A reference', REFERENCE_TARGET_ID),
      map: MAP,
    };

    const written = labels(build()(entity));
    expect(written.filter((label) => label.includes('Target'))).toEqual(['Copy link to Target']);
  });

  it('withholds the independent Space address from a Markdown Resource', () => {
    const entity: SpaceEntity = {
      kind: 'resource',
      resource: resource(PLACED_RESOURCE_ID, 'A'),
      map: MAP,
    };

    expect(labels(build()(entity))).toEqual([
      'Copy link to Resource in Map',
      'Copy link to Resource',
    ]);
  });

  it('begins a rename against the entity the row is about', () => {
    const onRename = vi.fn();

    commands(build({ onRename })({ kind: 'graph', graph: GRAPH, map: MAP }))
      .filter((action) => action.id === 'rename')
      .forEach((action) => {
        void action.onSelect();
      });

    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename.mock.calls[0]?.[0]).toEqual({ kind: 'graph', id: GRAPH_ID });
    expect(onRename.mock.calls[0]?.[1]).toBe('Long');
  });
});
