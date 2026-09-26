import { describe, expect, it } from 'vitest';
import { newUuid, spaceFileSchema, uuidSchema } from '@project/core';
import { initializeSpace, loadSpace, newSpace, nextGraphColor } from '../src/index';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

describe('newSpace', () => {
  it('is a real space file, not something that only nearly parses', () => {
    expect(spaceFileSchema.safeParse(newSpace(newUuid).file).success).toBe(true);
  });

  it('loads, which is the only proof it is a space at all (ADR 0010)', () => {
    const { file, resourceFiles } = newSpace(newUuid);
    const result = loadSpace(file, resourceFiles);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.resources).toHaveLength(1);
    expect(result.space.maps).toHaveLength(1);
    expect(result.space.graphs).toHaveLength(1);
  });

  it('begins neutral Resource numbering at Resource 1 with an empty body (ADR 0018, ADR 0020)', () => {
    const { file, resourceFiles } = newSpace(newUuid);
    const result = loadSpace(file, resourceFiles);
    if (!result.ok) throw new Error('should load');

    const resource = result.space.resources[0]!;
    expect(resource.kind).toBe('markdown');
    expect(resource.title).toBe('Resource 1');
    expect(resource.kind === 'markdown' && resource.body).toBe('');
  });

  it('starts complete with its first Resource at the canonical centred position', () => {
    const { file, resourceFiles } = newSpace(newUuid);
    const result = loadSpace(file, resourceFiles);
    if (!result.ok) throw new Error('should load');

    const map = result.space.maps[0]!;
    const resource = result.space.resources[0]!;
    expect(map).toMatchObject({ title: 'Map 1', activeGraph: map.graphs[0]?.id });
    expect(map.graphs).toMatchObject([{ title: 'Graph 1', edges: [] }]);
    // An empty Map's first Graph stores the colour the one creation rule picks.
    expect(map.graphs[0]?.color).toBe(nextGraphColor([]));
    expect(map.positions[resource.id]).toEqual({ x: 0, y: 0, open: false });
    expect(result.space.defaultMap).toBe(map.id);
  });

  it('mints fresh UUID identity for each new space and its first resource', () => {
    const first = newSpace(newUuid);
    const second = newSpace(newUuid);

    expect(first.file.id).not.toBe(second.file.id);
    expect(first.resourceFiles[0]?.text).not.toBe(second.resourceFiles[0]?.text);
    expect(spaceFileSchema.safeParse(first.file).success).toBe(true);
  });

  it('puts the resource in `resources/`, named for its id', () => {
    const { resourceFiles } = newSpace(newUuid);
    expect(resourceFiles).toHaveLength(1);
    expect(resourceFiles[0]!.path).toMatch(/^resources\/[0-9a-f-]{36}\.md$/);
  });

  it('is a fresh value each time, so one space cannot mutate another', () => {
    expect(newSpace(newUuid)).not.toBe(newSpace(newUuid));
    expect(newSpace(newUuid).resourceFiles).not.toBe(newSpace(newUuid).resourceFiles);
  });
});

describe('initializeSpace', () => {
  it('creates the same complete one-Resource shape as newSpace from one identity source', () => {
    const ids = [SPACE_ID, RESOURCE_ID, MAP_ID, GRAPH_ID];
    const initialized = initializeSpace({
      title: 'Architecture',
      newId: () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('initializer minted too many ids');
        return id;
      },
    });

    const result = loadSpace(initialized.file, initialized.resourceFiles);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));

    expect(ids).toEqual([]);
    expect(result.space).toMatchObject({
      id: SPACE_ID,
      title: 'Architecture',
      resources: [{ id: RESOURCE_ID, title: 'Resource 1', kind: 'markdown', body: '' }],
    });
    expect(result.space.maps).toEqual([
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Graph 1',
            color: nextGraphColor([]),
            headShape: 'arrow',
            edges: [],
          },
        ],
        activeGraph: GRAPH_ID,
      },
    ]);
    expect(result.space.defaultMap).toBe(MAP_ID);
  });
});
