import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, type ObserverErrorReporter } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { createEmbeddedAuthoring } from '../src/embedded-authoring';
import type { OpenSpace } from '../src/open-spaces';
import { openTestSpace } from './opened-space';

/**
 * What an embedded canvas does with a completion it does not support.
 *
 * The kinds it forwards are the whole of what its surfaces produce, so any
 * other kind arriving is a wiring defect rather than a domain rule the author
 * has run into. `AuthoringResult` says a broken invariant "throws, or is
 * reported through the non-throwing reporter", and the refusal that used to
 * stand here broke that twice over — it dressed a defect as the author's
 * mistake, and it did so with a sentence about Edge endpoints.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const THING_B = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Target',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [THING_A]: { x: 10, y: 20, open: false },
          [THING_B]: { x: 300, y: 40, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [
    { id: THING_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: THING_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

const openEntry = (reportObserverError: ObserverErrorReporter): OpenSpace => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const opened = openTestSpace(new MemorySpaceBackend([loaded]), loaded);
  return {
    id: SPACE_ID,
    session: opened.spaceSession,
    app: composeApp({ spaceSession: opened.spaceSession, reportObserverError }),
    spaceThings: opened.spaceThings,
  };
};

/**
 * The embedded composition, reporting where its target's composition does.
 *
 * The reporter is taken off the entry rather than handed in beside it, because
 * that is the one `EmbeddedDiagramAuthoring` spends (ADR 0016) — a recording one
 * supplied straight to the factory would prove the argument and not the wiring.
 */
const embedded = () => {
  const reported: unknown[] = [];
  const entry = openEntry((error) => {
    reported.push(error);
  });
  const composition = createEmbeddedAuthoring(entry, DIAGRAM_ID, entry.app.reportObserverError);
  return { composition, reported };
};

describe('a completion an embedded Diagram does not support', () => {
  it('is reported as an invariant rather than refused as an Edge that leaves the Diagram', () => {
    const { composition, reported } = embedded();

    const result = composition.authoring.complete({
      kind: 'created-thing',
      anchor: { x: 0, y: 0 },
    });

    expect(result).not.toMatchObject({ refusal: { code: 'edge-thing-outside-diagram' } });
    expect(result).toEqual({ kind: 'unchanged' });
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(Error);
    expect(String(reported[0])).toContain('created-thing');
  });

  /** The same for a second kind, so the arm reads as a fallthrough and not a case. */
  it('reports every unsupported kind, naming the one that arrived', () => {
    const { composition, reported } = embedded();

    const result = composition.authoring.complete({ kind: 'deleted-thing', thingId: THING_A });

    expect(result).toEqual({ kind: 'unchanged' });
    expect(String(reported[0])).toContain('deleted-thing');
  });

  /** Reporting is a diagnostic, never the gesture's failure path. */
  it('survives a reporter that throws', () => {
    const entry = openEntry(() => {
      throw new Error('reporter failed');
    });
    const composition = createEmbeddedAuthoring(entry, DIAGRAM_ID, entry.app.reportObserverError);

    expect(composition.authoring.complete({ kind: 'deleted-thing', thingId: THING_A })).toEqual({
      kind: 'unchanged',
    });
  });

  /**
   * The observer sink is the same injected one, and still says which it was.
   *
   * One reporter rather than two parameters: both are this module telling its
   * owner about a defect, and the sentence each carries is what distinguishes
   * an observer that threw from a completion that should never have arrived.
   */
  it('reports an observer failure through the same reporter, distinctly', () => {
    const { composition, reported } = embedded();
    composition.authoring.subscribe(() => {
      throw new Error('listener failed');
    });

    composition.observe()();

    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toContain('observer failed');
    expect(String(reported[0])).not.toContain('completion reached');
  });

  it('forwards a connection into the Graph the embedding is showing', () => {
    const { composition, reported } = embedded();

    expect(
      composition.authoring.complete({
        kind: 'connected-things',
        from: THING_A,
        to: THING_B,
        graphId: GRAPH_ID,
      }),
    ).toEqual({ kind: 'completed' });
    expect(reported).toEqual([]);
    expect(
      composition.authoring.getState().session.working.document.diagrams?.[0]?.graphs[0]?.edges,
    ).toEqual([{ from: THING_A, to: THING_B }]);
  });

  /** Supported kinds still reach the target's own Space Authoring. */
  it('still forwards a supported kind into the Diagram', () => {
    const { composition, reported } = embedded();

    expect(
      composition.authoring.complete({ kind: 'opened-thing', thingId: THING_A }),
    ).toMatchObject({
      kind: 'completed',
    });
    expect(reported).toEqual([]);
  });

  it('does not forward Graph deletion, which coordinated lifecycle owns', () => {
    const { composition, reported } = embedded();

    expect(composition.authoring.complete({ kind: 'deleted-graph', graphId: GRAPH_ID })).toEqual({
      kind: 'unchanged',
    });
    expect(String(reported[0])).toContain('deleted-graph');
    expect(
      composition.authoring.getState().session.working.document.diagrams?.[0]?.graphs,
    ).toHaveLength(1);
  });
});

describe('context commands on the Diagram an embedding is showing', () => {
  it('forwards renaming the Diagram', () => {
    const { composition, reported } = embedded();

    expect(
      composition.authoring.complete({
        kind: 'renamed-diagram',
        diagramId: DIAGRAM_ID,
        title: 'Renamed',
      }),
    ).toEqual({ kind: 'completed' });
    expect(reported).toEqual([]);
    expect(composition.authoring.getState().session.working.document.diagrams?.[0]?.title).toBe(
      'Renamed',
    );
  });

  it('forwards renaming, recoloring and adding a Graph', () => {
    const { composition, reported } = embedded();

    expect(
      composition.authoring.complete({
        kind: 'renamed-graph',
        graphId: GRAPH_ID,
        title: 'Renamed Graph',
      }),
    ).toEqual({ kind: 'completed' });
    expect(
      composition.authoring.complete({
        kind: 'recolored-graph',
        graphId: GRAPH_ID,
        color: '#aec7e8',
      }),
    ).toEqual({ kind: 'completed' });
    expect(composition.authoring.complete({ kind: 'added-graph' })).toMatchObject({
      kind: 'completed',
    });
    expect(reported).toEqual([]);
    const graph =
      composition.authoring.getState().session.working.document.diagrams?.[0]?.graphs[0];
    expect(graph?.title).toBe('Renamed Graph');
    expect(graph?.color).toBe('#aec7e8');
    expect(
      composition.authoring.getState().session.working.document.diagrams?.[0]?.graphs,
    ).toHaveLength(2);
  });
});
