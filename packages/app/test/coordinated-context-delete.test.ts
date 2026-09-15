import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  coordinatedDeleteOk,
  coordinatedDiagramDelete,
  coordinatedGraphDelete,
  type CoordinatedContextDeleteResult,
} from '../src/coordinated-context-delete';

const TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const REPLACEMENT_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const REPLACEMENT_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const PERSISTENCE_UNSETTLED = 'The change could not be saved. Check the Space persistence status.';

const diagramInput = {
  targetSpaceId: TARGET,
  diagramId: DIAGRAM,
  preferredDiagramId: null,
};
const graphInput = {
  targetSpaceId: TARGET,
  diagramId: DIAGRAM,
  graphId: GRAPH,
  preferredGraphId: null,
};

const refuse = () =>
  Promise.resolve({
    kind: 'refused' as const,
    refusal: { code: 'diagram-not-found' as const, diagramId: DIAGRAM },
  });

const succeed = () =>
  Promise.resolve({
    kind: 'completed' as const,
    diagramId: REPLACEMENT_DIAGRAM,
    graphId: REPLACEMENT_GRAPH,
  });

const noop = () => Promise.resolve({ kind: 'unchanged' as const });

const expectMappedRefusal = (result: CoordinatedContextDeleteResult) => {
  expect(result).toEqual({
    kind: 'error',
    message: 'This Diagram is no longer part of the Space.',
  });
};

const expectReplacementPair = (result: CoordinatedContextDeleteResult) => {
  expect(result).toEqual({
    kind: 'completed',
    diagramId: REPLACEMENT_DIAGRAM,
    graphId: REPLACEMENT_GRAPH,
  });
};

describe('coordinated Diagram delete', () => {
  it('maps a lifecycle refusal into the author-facing sentence', async () => {
    expectMappedRefusal(await coordinatedDiagramDelete(refuse, diagramInput));
  });

  it('returns the replacement Diagram and Graph pair', async () => {
    expectReplacementPair(
      await coordinatedDiagramDelete(succeed, diagramInput, () => Promise.resolve(true)),
    );
  });

  it('answers the persistence error and does not delete when waitBefore returns false', async () => {
    let deleted = false;
    const result = await coordinatedDiagramDelete(
      () => {
        deleted = true;
        return succeed();
      },
      diagramInput,
      () => Promise.resolve(false),
    );
    expect(deleted).toBe(false);
    expect(result).toEqual({ kind: 'error', message: PERSISTENCE_UNSETTLED });
  });

  it('passes a lifecycle no-op through as unchanged', async () => {
    expect(await coordinatedDiagramDelete(noop, diagramInput)).toEqual({ kind: 'unchanged' });
  });
});

describe('coordinated Graph delete', () => {
  it('maps a lifecycle refusal into the author-facing sentence', async () => {
    expectMappedRefusal(await coordinatedGraphDelete(refuse, graphInput));
  });

  it('returns the replacement Diagram and Graph pair', async () => {
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
        diagramId: REPLACEMENT_DIAGRAM,
        graphId: REPLACEMENT_GRAPH,
      }),
    ).toBe(true);
    expect(coordinatedDeleteOk({ kind: 'error', message: PERSISTENCE_UNSETTLED })).toBe(false);
  });
});

/**
 * Ticket 03: Dock Diagram and Graph delete share the wrappers, with no preferred
 * replacement — Navigation always adopts the pair the lifecycle returns.
 * `spaceThings.deleteDiagram({` / `deleteGraph({` would be a second orchestration
 * path beside the wrappers.
 */
describe('Dock delete wiring', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), { encoding: 'utf8' });

  it('sends Diagram delete through the wrapper with no preferred Diagram', () => {
    expect(app).toMatch(/coordinatedDiagramDelete\(\s*spaceThings\.deleteDiagram,/u);
    expect(app).toMatch(/preferredDiagramId:\s*null/u);
    expect(app).not.toMatch(/spaceThings\.deleteDiagram\(\s*\{/u);
  });

  it('sends Graph delete through the wrapper with no preferred Graph', () => {
    expect(app).toMatch(/coordinatedGraphDelete\(\s*spaceThings\.deleteGraph,/u);
    expect(app).toMatch(/preferredGraphId:\s*null/u);
    expect(app).not.toMatch(/spaceThings\.deleteGraph\(\s*\{/u);
  });
});
