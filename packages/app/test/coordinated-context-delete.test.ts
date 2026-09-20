import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  coordinatedDeleteOk,
  coordinatedMapDelete,
  coordinatedGraphDelete,
  type CoordinatedContextDeleteResult,
} from '../src/coordinated-context-delete';

const TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const REPLACEMENT_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const REPLACEMENT_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const PERSISTENCE_UNSETTLED = 'The change could not be saved. Check the Space persistence status.';

const mapInput = {
  targetSpaceId: TARGET,
  mapId: MAP,
  preferredMapId: null,
};
const graphInput = {
  targetSpaceId: TARGET,
  mapId: MAP,
  graphId: GRAPH,
  preferredGraphId: null,
};

const refuse = () =>
  Promise.resolve({
    kind: 'refused' as const,
    refusal: { code: 'map-not-found' as const, mapId: MAP },
  });

const succeed = () =>
  Promise.resolve({
    kind: 'completed' as const,
    mapId: REPLACEMENT_MAP,
    graphId: REPLACEMENT_GRAPH,
  });

const noop = () => Promise.resolve({ kind: 'unchanged' as const });

const expectMappedRefusal = (result: CoordinatedContextDeleteResult) => {
  expect(result).toEqual({
    kind: 'error',
    message: 'This Map is no longer part of the Space.',
  });
};

const expectReplacementPair = (result: CoordinatedContextDeleteResult) => {
  expect(result).toEqual({
    kind: 'completed',
    mapId: REPLACEMENT_MAP,
    graphId: REPLACEMENT_GRAPH,
  });
};

describe('coordinated Map delete', () => {
  it('maps a lifecycle refusal into the author-facing sentence', async () => {
    expectMappedRefusal(await coordinatedMapDelete(refuse, mapInput));
  });

  it('returns the replacement Map and Graph pair', async () => {
    expectReplacementPair(
      await coordinatedMapDelete(succeed, mapInput, () => Promise.resolve(true)),
    );
  });

  it('answers the persistence error and does not delete when waitBefore returns false', async () => {
    let deleted = false;
    const result = await coordinatedMapDelete(
      () => {
        deleted = true;
        return succeed();
      },
      mapInput,
      () => Promise.resolve(false),
    );
    expect(deleted).toBe(false);
    expect(result).toEqual({ kind: 'error', message: PERSISTENCE_UNSETTLED });
  });

  it('passes a lifecycle no-op through as unchanged', async () => {
    expect(await coordinatedMapDelete(noop, mapInput)).toEqual({ kind: 'unchanged' });
  });
});

describe('coordinated Graph delete', () => {
  it('maps a lifecycle refusal into the author-facing sentence', async () => {
    expectMappedRefusal(await coordinatedGraphDelete(refuse, graphInput));
  });

  it('returns the replacement Map and Graph pair', async () => {
    expectReplacementPair(
      await coordinatedGraphDelete(succeed, graphInput, () => Promise.resolve(true)),
    );
  });

  it('answers the persistence error and does not delete when waitBefore returns false', async () => {
    let deleted = false;
    const result = await coordinatedGraphDelete(
      () => {
        deleted = true;
        return succeed();
      },
      graphInput,
      () => Promise.resolve(false),
    );
    expect(deleted).toBe(false);
    expect(result).toEqual({ kind: 'error', message: PERSISTENCE_UNSETTLED });
  });

  it('passes a lifecycle no-op through as unchanged', async () => {
    expect(await coordinatedGraphDelete(noop, graphInput)).toEqual({ kind: 'unchanged' });
  });
});

describe('coordinated delete and the entity menu', () => {
  it('does not report unchanged as a menu failure', () => {
    expect(coordinatedDeleteOk({ kind: 'unchanged' })).toBe(true);
    expect(
      coordinatedDeleteOk({
        kind: 'completed',
        mapId: REPLACEMENT_MAP,
        graphId: REPLACEMENT_GRAPH,
      }),
    ).toBe(true);
    expect(coordinatedDeleteOk({ kind: 'error', message: PERSISTENCE_UNSETTLED })).toBe(false);
  });
});

/**
 * Ticket 03: Dock Map and Graph delete share the wrappers, with no preferred
 * replacement — Navigation always adopts the pair the lifecycle returns.
 * `spaceResources.deleteMap({` / `deleteGraph({` would be a second orchestration
 * path beside the wrappers.
 */
describe('Dock delete wiring', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), { encoding: 'utf8' });

  it('sends Map delete through the wrapper with no preferred Map', () => {
    expect(app).toMatch(/coordinatedMapDelete\(\s*spaceResources\.deleteMap,/u);
    expect(app).toMatch(/preferredMapId:\s*null/u);
    expect(app).not.toMatch(/spaceResources\.deleteMap\(\s*\{/u);
  });

  it('sends Graph delete through the wrapper with no preferred Graph', () => {
    expect(app).toMatch(/coordinatedGraphDelete\(\s*spaceResources\.deleteGraph,/u);
    expect(app).toMatch(/preferredGraphId:\s*null/u);
    expect(app).not.toMatch(/spaceResources\.deleteGraph\(\s*\{/u);
  });
});
