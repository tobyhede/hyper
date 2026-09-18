import { act, render } from '@testing-library/react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type UUID } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import { authoringAvailability } from '../src/authoring-availability';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import { composeApp } from '../src/compose-app';
import type { EdgeAuthoring } from '../src/edge-authoring';
import { OpenSpacesContext } from '../src/open-spaces-context';
import type { OpenSpace, OpenSpaces, OpenSpacesState } from '../src/open-spaces';
import type { SpaceThingFraming } from '../src/space-thing-framing';
import { THING_SIZE } from '../src/thing';

const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const HOST_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const HOST_FRAMING: SpaceThingFraming = { centreX: 1, centreY: 1, zoom: 9 };
const TARGET_FRAMING: SpaceThingFraming = { centreX: 100, centreY: 50, zoom: 2 };

const snapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: { [THING_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [{ id: THING_ID, document: { title: 'A', kind: 'markdown', body: 'A' } }],
});

const IDLE_EDGE_STATE = { draft: null, refusal: null } as const;

function inertEdgeAuthoring(): EdgeAuthoring {
  return {
    getState: () => IDLE_EDGE_STATE,
    subscribe: () => () => undefined,
    eligibility: () => ({
      kind: 'refused',
      refusal: { code: 'diagram-required', operation: 'reconnected-edge' },
    }),
    accepts: () => false,
    beginPointerConnect: () => undefined,
    connect: () => undefined,
    createConnectedThing: () => undefined,
    endPointerDrag: () => undefined,
    beginPointerReconnect: () => undefined,
    openEdgeEditor: () => undefined,
    reconnect: () => false,
    deleteEdge: () => false,
    cancelDraft: () => undefined,
    dispose: () => undefined,
  };
}

function unused(): never {
  throw new Error('OpenSpaces method unused by this canvas mount');
}

function thingNode(): ThingFlowNode {
  return {
    id: THING_ID,
    type: 'thing',
    position: { x: 0, y: 0 },
    width: THING_SIZE.width,
    height: THING_SIZE.height,
    selected: false,
    data: {
      thingId: THING_ID,
      title: 'A',
      readOnly: false,
      kind: 'markdown',
      active: false,
      selectedForAuthoring: false,
      showContent: false,
      activeGraphId: null,
      activeGraphColor: '#8a94a6',
      emphasis: 'equal',
    },
  };
}

function Subscribed({ spaces, children }: { spaces: OpenSpaces; children: ReactNode }) {
  useSyncExternalStore(spaces.subscribe, spaces.getState);
  return children;
}

function stubEntry(
  id: UUID,
  spaceSession: OpenSpace['session'],
  app: OpenSpace['app'],
  spaceThings: OpenSpace['spaceThings'],
): OpenSpace {
  return { id, session: spaceSession, app, spaceThings };
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

describe('opening framing on a mounted canvas', () => {
  it('ignores the host seed while hidden and reads this canvas when it first becomes active', () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(stored), stored);
    const app = composeApp({ spaceSession });
    const spaceThings: OpenSpace['spaceThings'] = {
      create: unused,
      link: unused,
      delete: unused,
      deleteDiagram: unused,
      deleteGraph: unused,
      referenceableSpaces: unused,
      target: unused,
      spaceSet: { getState: () => 0, subscribe: () => () => undefined },
    };
    const hostEntry = stubEntry(HOST_ID, spaceSession, app, spaceThings);
    const targetEntry = stubEntry(TARGET_ID, spaceSession, app, spaceThings);
    const asked: UUID[] = [];
    const seeds: (SpaceThingFraming | undefined)[] = [];
    const framingByEntry = new Map<OpenSpace, SpaceThingFraming>([[hostEntry, HOST_FRAMING]]);
    const listeners = new Set<() => void>();
    const entries: readonly OpenSpace[] = [];
    let state: OpenSpacesState = {
      activeSpaceId: HOST_ID,
      entries,
      openedFrom: new Map(),
    };
    const spaces: OpenSpaces = {
      metaSpaceId: HOST_ID,
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      entry: (spaceId) => {
        if (spaceId === HOST_ID) return hostEntry;
        if (spaceId === TARGET_ID) return targetEntry;
        return undefined;
      },
      openingFraming: (entry) => {
        asked.push(entry.id);
        const seed = framingByEntry.get(entry);
        seeds.push(seed);
        return seed;
      },
      open: unused,
      embed: unused,
      waitForPersistence: unused,
      openPath: unused,
      enter: unused,
      switchTo: unused,
      exit: unused,
      spaceThings,
      browserLocation: {
        getState: () => ({ addressedThingId: null, destinationNotFound: false }),
        subscribe: () => () => undefined,
        follow: unused,
        activate: unused,
        chooseDiagram: unused,
        activateGraph: unused,
        href: unused,
        dispose: unused,
      },
    };

    render(
      <OpenSpacesContext.Provider value={spaces}>
        <Subscribed spaces={spaces}>
          <ReactFlowProvider>
            <SpaceCanvas
              continuation={app.continuation}
              nodes={[thingNode()]}
              edges={[]}
              projectedNodes={null}
              activeThingId={null}
              presenting={false}
              placementReady={true}
              availability={authoringAvailability({
                editable: true,
                presenting: false,
                editingThingBody: false,
                editingThingTitle: false,
                thingIsOpen: false,
                editingChromeTitle: false,
                spaceOnCanvas: true,
                editingEmbeddedDiagram: false,
                creatingSpaceThing: false,
              })}
              onNodesChange={() => undefined}
              onEdgesChange={() => undefined}
              edgeAuthoring={inertEdgeAuthoring()}
              selection={{ kind: 'none' }}
              onSelectThing={() => undefined}
              onSelectEdge={() => undefined}
              placedThings={[]}
              newThingTitle="Thing 2"
              onAddThing={() => undefined}
              onAddExistingThing={() => undefined}
              nameOnCreation={null}
              authoring={app.authoring}
              spaceSession={spaceSession}
              onBodyEditingChange={() => undefined}
              onTitleEditingChange={() => undefined}
              thingResize={{
                beginResize: () => undefined,
                previewResize: () => undefined,
                finishResize: () => undefined,
                cancelResize: () => undefined,
              }}
              reportEmbeddedDiagramEditing={() => undefined}
              graphs={[]}
              colorByGraphId={{}}
              activeGraphId={null}
              activeGraphThingIds={new Set()}
            />
          </ReactFlowProvider>
        </Subscribed>
      </OpenSpacesContext.Provider>,
    );

    expect(asked).toEqual([]);
    expect(seeds).toEqual([]);

    act(() => {
      framingByEntry.set(targetEntry, TARGET_FRAMING);
      state = { ...state, activeSpaceId: TARGET_ID };
      for (const listener of [...listeners]) listener();
    });

    expect(asked).toEqual([TARGET_ID]);
    expect(seeds).toEqual([TARGET_FRAMING]);

    act(() => {
      state = { ...state, activeSpaceId: HOST_ID };
      for (const listener of [...listeners]) listener();
    });
    act(() => {
      framingByEntry.set(targetEntry, { centreX: 1, centreY: 1, zoom: 5 });
      state = { ...state, activeSpaceId: TARGET_ID };
      for (const listener of [...listeners]) listener();
    });

    expect(asked).toEqual([TARGET_ID]);
  });

  it('reads this canvas seed on the first paint when it is already the active Space', () => {
    const stored = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(stored), stored);
    const app = composeApp({ spaceSession });
    const spaceThings: OpenSpace['spaceThings'] = {
      create: unused,
      link: unused,
      delete: unused,
      deleteDiagram: unused,
      deleteGraph: unused,
      referenceableSpaces: unused,
      target: unused,
      spaceSet: { getState: () => 0, subscribe: () => () => undefined },
    };
    const targetEntry = stubEntry(TARGET_ID, spaceSession, app, spaceThings);
    const asked: UUID[] = [];
    const state: OpenSpacesState = {
      activeSpaceId: TARGET_ID,
      entries: [],
      openedFrom: new Map(),
    };
    const spaces: OpenSpaces = {
      metaSpaceId: TARGET_ID,
      getState: () => state,
      subscribe: () => () => undefined,
      entry: (spaceId) => (spaceId === TARGET_ID ? targetEntry : undefined),
      openingFraming: (entry) => {
        asked.push(entry.id);
        return TARGET_FRAMING;
      },
      open: unused,
      embed: unused,
      waitForPersistence: unused,
      openPath: unused,
      enter: unused,
      switchTo: unused,
      exit: unused,
      spaceThings,
      browserLocation: {
        getState: () => ({ addressedThingId: null, destinationNotFound: false }),
        subscribe: () => () => undefined,
        follow: unused,
        activate: unused,
        chooseDiagram: unused,
        activateGraph: unused,
        href: unused,
        dispose: unused,
      },
    };

    render(
      <OpenSpacesContext.Provider value={spaces}>
        <ReactFlowProvider>
          <SpaceCanvas
            continuation={app.continuation}
            nodes={[thingNode()]}
            edges={[]}
            projectedNodes={null}
            activeThingId={null}
            presenting={false}
            placementReady={true}
            availability={authoringAvailability({
              editable: true,
              presenting: false,
              editingThingBody: false,
              editingThingTitle: false,
              thingIsOpen: false,
              editingChromeTitle: false,
              spaceOnCanvas: true,
              editingEmbeddedDiagram: false,
              creatingSpaceThing: false,
            })}
            onNodesChange={() => undefined}
            onEdgesChange={() => undefined}
            edgeAuthoring={inertEdgeAuthoring()}
            selection={{ kind: 'none' }}
            onSelectThing={() => undefined}
            onSelectEdge={() => undefined}
            placedThings={[]}
            newThingTitle="Thing 2"
            onAddThing={() => undefined}
            onAddExistingThing={() => undefined}
            nameOnCreation={null}
            authoring={app.authoring}
            spaceSession={spaceSession}
            onBodyEditingChange={() => undefined}
            onTitleEditingChange={() => undefined}
            thingResize={{
              beginResize: () => undefined,
              previewResize: () => undefined,
              finishResize: () => undefined,
              cancelResize: () => undefined,
            }}
            reportEmbeddedDiagramEditing={() => undefined}
            graphs={[]}
            colorByGraphId={{}}
            activeGraphId={null}
            activeGraphThingIds={new Set()}
          />
        </ReactFlowProvider>
      </OpenSpacesContext.Provider>,
    );

    expect(asked).toEqual([TARGET_ID]);
  });
});
