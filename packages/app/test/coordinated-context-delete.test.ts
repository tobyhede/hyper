import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  coordinatedGraphDelete,
  type CoordinatedContextDeleteResult,
} from '../src/coordinated-context-delete';

const TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const REPLACEMENT_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const REPLACEMENT_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const PERSISTENCE_UNSETTLED = 'The change could not be saved. Check the Space persistence status.';

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

/**
 * Ticket 03: Dock Graph delete goes through the wrapper, with no preferred
 * replacement — Navigation always adopts the pair the lifecycle returns.
 * `spaceResources.deleteGraph({` would be a second orchestration path beside
 * it. Map deletion left the wrapper for Map authoring
 * (`.scratch/command-outcomes/issues/08`), which owns its coordination; a
 * direct `spaceResources.deleteMap` in App would be a second path beside that.
 */
describe('Dock delete wiring', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), { encoding: 'utf8' });

  it('sends Map delete through Map authoring rather than the lifecycle', () => {
    expect(app).toMatch(/offered\(\s*mapAuthoring\.map\(selectedMap\.map\.id\)\.delete,/u);
    expect(app).toMatch(
      /commandOutcomes\.run\('map-delete',\s*remove,\s*\{\s*completionMovesMap:\s*true\s*\}\)/u,
    );
    expect(app).not.toMatch(/spaceResources\.deleteMap\b/u);
  });

  it('sends Graph delete through the wrapper with no preferred Graph', () => {
    expect(app).toMatch(/coordinatedGraphDelete\(\s*spaceResources\.deleteGraph,/u);
    expect(app).toMatch(/preferredGraphId:\s*null/u);
    expect(app).not.toMatch(/spaceResources\.deleteGraph\(\s*\{/u);
  });
});
