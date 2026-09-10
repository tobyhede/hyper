import { describe, expect, it } from 'vitest';
import { newUuid, spaceFileSchema, uuidSchema } from '@project/core';
import { initializeSpace, loadSpace, newSpace } from '../src/index';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

describe('newSpace', () => {
  it('is a real space file, not something that only nearly parses', () => {
    expect(spaceFileSchema.safeParse(newSpace(newUuid).file).success).toBe(true);
  });

  it('loads, which is the only proof it is a space at all (ADR 0010)', () => {
    const { file, thingFiles } = newSpace(newUuid);
    const result = loadSpace(file, thingFiles);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.things).toHaveLength(1);
    expect(result.space.diagrams).toHaveLength(1);
    expect(result.space.graphs).toHaveLength(1);
  });

  it('begins neutral Thing numbering at Thing 1 with an empty body (ADR 0018, ADR 0020)', () => {
    const { file, thingFiles } = newSpace(newUuid);
    const result = loadSpace(file, thingFiles);
    if (!result.ok) throw new Error('should load');

    const thing = result.space.things[0]!;
    expect(thing.kind).toBe('markdown');
    expect(thing.title).toBe('Thing 1');
    expect(thing.kind === 'markdown' && thing.body).toBe('');
  });

  it('starts complete with its first Thing at the canonical centred position', () => {
    const { file, thingFiles } = newSpace(newUuid);
    const result = loadSpace(file, thingFiles);
    if (!result.ok) throw new Error('should load');

    const diagram = result.space.diagrams[0]!;
    const thing = result.space.things[0]!;
    expect(diagram).toMatchObject({ title: 'Diagram 1', activeGraph: diagram.graphs[0]?.id });
    expect(diagram.graphs).toMatchObject([{ title: 'Graph 1', edges: [] }]);
    expect(diagram.positions[thing.id]).toEqual({ x: 0, y: 0, open: false });
    expect(result.space.defaultDiagram).toBe(diagram.id);
  });

  it('mints fresh UUID identity for each new space and its first thing', () => {
    const first = newSpace(newUuid);
    const second = newSpace(newUuid);

    expect(first.file.id).not.toBe(second.file.id);
    expect(first.thingFiles[0]?.text).not.toBe(second.thingFiles[0]?.text);
    expect(spaceFileSchema.safeParse(first.file).success).toBe(true);
  });

  it('puts the thing in `things/`, named for its id', () => {
    const { thingFiles } = newSpace(newUuid);
    expect(thingFiles).toHaveLength(1);
    expect(thingFiles[0]!.path).toMatch(/^things\/[0-9a-f-]{36}\.md$/);
  });

  it('is a fresh value each time, so one space cannot mutate another', () => {
    expect(newSpace(newUuid)).not.toBe(newSpace(newUuid));
    expect(newSpace(newUuid).thingFiles).not.toBe(newSpace(newUuid).thingFiles);
  });
});

describe('initializeSpace', () => {
  it('creates the same complete one-Thing shape as newSpace from one identity source', () => {
    const ids = [SPACE_ID, THING_ID, DIAGRAM_ID, GRAPH_ID];
    const initialized = initializeSpace({
      title: 'Architecture',
      newId: () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('initializer minted too many ids');
        return id;
      },
    });

    const result = loadSpace(initialized.file, initialized.thingFiles);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));

    expect(ids).toEqual([]);
    expect(result.space).toMatchObject({
      id: SPACE_ID,
      title: 'Architecture',
      things: [{ id: THING_ID, title: 'Thing 1', kind: 'markdown', body: '' }],
    });
    expect(result.space.diagrams).toEqual([
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: { [THING_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ]);
    expect(result.space.defaultDiagram).toBe(DIAGRAM_ID);
  });
});
