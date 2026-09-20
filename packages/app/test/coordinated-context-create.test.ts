import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { coordinatedContextCreate, createdMapContext } from '../src/coordinated-context-create';
import type { AuthoringResult } from '../src/space-authoring';

const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const PERSISTENCE_UNSETTLED = 'The change could not be saved. Check the Space persistence status.';

const completed: AuthoringResult = { kind: 'completed' };
const created = { id: MAP };

describe('coordinated context create', () => {
  it('answers the persistence error and does not create when waitBefore returns false', async () => {
    let createdKind = false;
    const result = await coordinatedContextCreate({
      waitBefore: () => Promise.resolve(false),
      create: () => {
        createdKind = true;
        return completed;
      },
      createdOf: () => ({ created, active: GRAPH }),
      afterCreated: () => null,
    });
    expect(createdKind).toBe(false);
    expect(result).toBe(PERSISTENCE_UNSETTLED);
  });

  it('maps an authoring refusal into the author-facing sentence', async () => {
    let hooked = false;
    const result = await coordinatedContextCreate({
      create: () => ({ kind: 'refused', refusal: { code: 'map-not-found' } }),
      createdOf: () => ({ created, active: GRAPH }),
      afterCreated: () => {
        hooked = true;
        return null;
      },
    });
    expect(hooked).toBe(false);
    expect(result).toBe('This Map is no longer part of the Space.');
  });

  it('answers the persistence error and does not hook when the created Map has not persisted', async () => {
    let hooked = false;
    const result = await coordinatedContextCreate({
      create: () => completed,
      waitUntilPersisted: () => Promise.resolve(false),
      createdOf: () => ({ created, active: GRAPH }),
      afterCreated: () => {
        hooked = true;
        return null;
      },
    });
    expect(hooked).toBe(false);
    expect(result).toBe(PERSISTENCE_UNSETTLED);
  });

  it('reads createdOf before waitUntilPersisted', async () => {
    const order: string[] = [];
    await coordinatedContextCreate({
      create: () => {
        order.push('create');
        return completed;
      },
      waitUntilPersisted: () => {
        order.push('wait');
        return Promise.resolve(true);
      },
      createdOf: () => {
        order.push('createdOf');
        return { created, active: GRAPH };
      },
      afterCreated: () => {
        order.push('after');
        return null;
      },
    });
    expect(order).toEqual(['create', 'createdOf', 'wait', 'after']);
  });

  it('hands the created identities to afterCreated and returns that follow-up', async () => {
    const received: { id: string; active: string }[] = [];
    const result = await coordinatedContextCreate({
      waitBefore: () => Promise.resolve(true),
      create: () => completed,
      waitUntilPersisted: () => Promise.resolve(true),
      createdOf: () => ({ created, active: GRAPH }),
      afterCreated: (next, active) => {
        received.push({ id: next.id, active });
        return 'stored selection refused';
      },
    });
    expect(received).toEqual([{ id: MAP, active: GRAPH }]);
    expect(result).toBe('stored selection refused');
  });
});

describe('created Map context', () => {
  const map = {
    id: MAP,
    title: 'Map 1',
    kind: 'positioned' as const,
    positions: {},
    graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
  };

  it('reads the selected Map and its Active Graph', () => {
    const selected = { ...map, activeGraph: GRAPH };
    expect(createdMapContext([selected], MAP)).toEqual({
      created: selected,
      active: GRAPH,
    });
  });

  it("falls back to the Map's first Graph when none is Active", () => {
    expect(createdMapContext([map], MAP)?.active).toBe(GRAPH);
  });

  it('answers undefined when the selected Map is missing', () => {
    expect(createdMapContext([map], null)).toBeUndefined();
  });
});

describe('coordinated context create module', () => {
  it('does not import continuation targets', () => {
    const source = readFileSync(new URL('../src/coordinated-context-create.ts', import.meta.url), {
      encoding: 'utf8',
    });
    expect(source).not.toMatch(/from ['"]\.\/continuation['"]/);
  });
});
