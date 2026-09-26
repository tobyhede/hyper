import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  spaceSnapshotSchema,
  uuidSchema,
  type ResourceDocument,
  type ResourceId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type SpaceSession,
} from '@project/persistence';
import { EMBEDDED_EDGE_TYPE, embeddedNodeId } from '../src/embedded-map';
import { createOpenSpaces, type OpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { mountSettled } from './settled-mount';
import { newUuid } from '@project/core';
import {
  anyPresentControl,
  openSpaceMenu,
  openSpaceRow,
  openSpacesMenu,
  unavailable,
} from './command-dock';

/**
 * What an Open Space Resource *shows* (ADR 0068).
 *
 * `space-resource-selection.test.tsx` holds the two selections the Resource authors;
 * this file holds what those selections then draw. The two claims that matter
 * are that the Map drawn is the **Resource's** and never the target Space's own
 * — the target's `defaultMap` here is deliberately not the one the Resource
 * selects — and that target editing, draft ownership and retained reads remain
 * coherent inside the containing canvas as a sub flow.
 *
 * The application half of the evidence ADR 0052 requires; the Ladle half is
 * `stories/surfaces/space-resource-embedded-map.stories.tsx`.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SELECTED_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const SELECTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const DRAWN_A = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const DRAWN_B = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const UNPLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

/**
 * A Map and Graph of the target that the target does not hold: the dangling
 * selection left behind when the Map a Space Resource named is deleted.
 *
 * A Space Resource selects from the moment it exists (ADR 0079), so a stored pair
 * that resolves to nothing is this and never an unmade choice.
 */
const DELETED_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const DELETED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

/** Two Spaces no backend holds, each reached by a Space Resource of its own. */
const GONE_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const GONE_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
const GONE_A_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000052');
const GONE_B_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000053');
const GONE_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000054');
const GONE_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000055');

/**
 * The target: two Maps over three Resources, and the one the Resource selects is
 * **not** the Space's own `defaultMap`.
 *
 * That asymmetry is the fixture's whole job. With one Map, or with the
 * selected one also being the default, a Resource reading the target's own
 * selection would draw exactly what a Resource reading its own does.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    maps: [
      {
        id: SELECTED_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: {
          [DRAWN_A]: { x: 0, y: 0, open: false },
          [DRAWN_B]: { x: 264, y: 0, open: false },
        },
        graphs: [
          { id: SELECTED_GRAPH_ID, title: 'Overview', edges: [{ from: DRAWN_A, to: DRAWN_B }] },
        ],
      },
      {
        id: OTHER_MAP_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [UNPLACED]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultMap: OTHER_MAP_ID,
  },
  resources: [
    { id: DRAWN_A, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: DRAWN_B, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: UNPLACED, document: { title: 'Elsewhere entirely', kind: 'markdown', body: '' } },
  ],
});

/** Home, holding one Space Resource the Map has already Opened (ADR 0064). */
const home = (spaceResource: Extract<ResourceDocument, { kind: 'space' }>): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: HOME_ID,
    document: {
      version: 1,
      title: 'Home',
      maps: [
        {
          id: HOME_MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions: {
            [HOME_RESOURCE_ID]: { x: 10, y: 20, open: false },
            [SPACE_RESOURCE_ID]: {
              x: 600,
              y: 20,
              open: true,
              openSize: { width: 700, height: 500 },
            },
          },
          graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultMap: HOME_MAP_ID,
    },
    resources: [
      { id: HOME_RESOURCE_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
      { id: SPACE_RESOURCE_ID, document: spaceResource },
    ],
  });

const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [META_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: META_MAP_ID,
  },
  resources: [
    { id: META_RESOURCE_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        map: HOME_MAP_ID,
        graph: HOME_GRAPH_ID,
      },
    },
    {
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: OTHER_MAP_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
});

async function mount(value: SpaceSnapshot): Promise<SpaceSession> {
  return (await mountOpenSpaces(value)).session;
}

/** {@link mount}, answering the Open Spaces it mounted as well. */
async function mountOpenSpaces(
  value: SpaceSnapshot,
): Promise<{ readonly session: SpaceSession; readonly spaces: OpenSpaces }> {
  const backend = new MemorySpaceBackend(
    META_ID,
    [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: recordingHistory(),
  });
  const initial = await spaces.open(HOME_ID);
  await mountSettled(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  return { session: initial.session, spaces };
}

const queryEmbeddedNode = (resourceId: ResourceId): HTMLElement | null => {
  const node = document.querySelector(
    `.react-flow__node[data-id="${embeddedNodeId(SPACE_RESOURCE_ID, resourceId)}"]`,
  );
  return node instanceof HTMLElement ? node : null;
};

/** The same query where its absence is a broken test rather than a claim. */
const embeddedNode = (resourceId: ResourceId): HTMLElement => {
  const node = queryEmbeddedNode(resourceId);
  if (node === null) throw new Error(`no embedded node is drawn for ${resourceId}`);
  return node;
};

/** A Resource of the *containing* Map, by the node the canvas draws it as. */
const containingNode = (resourceId: ResourceId): HTMLElement => {
  const node = document.querySelector(`.react-flow__node[data-id="${resourceId}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`no node is drawn for ${resourceId}`);
  return node;
};

/** The toolbar a Resource's node draws its commands in, if it is drawn now. */
const railFor = (node: HTMLElement): HTMLElement | null => {
  const id = node.dataset['id'];
  if (id === undefined) return null;
  const rail = document.querySelector(`[data-resource-rail-for="${id}"]`);
  return rail instanceof HTMLElement ? rail : null;
};

/**
 * A Resource's commands, selecting the Resource first when they are not drawn.
 *
 * The commands float in React Flow's `NodeToolbar`, portalled outside the node,
 * and are drawn only while the Resource is the one selected or while a content or
 * portal edit runs on it (`ResourceNode`). A click on the node wrapper is React
 * Flow's own selection gesture.
 */
const queryControlsOf = (node: HTMLElement): HTMLElement | null => {
  const drawn = railFor(node);
  if (drawn !== null) return drawn;
  fireEvent.click(node);
  return railFor(node);
};

/** {@link queryControlsOf}, where no toolbar is a broken test rather than a claim. */
const controlsOf = (node: HTMLElement): HTMLElement => {
  const rail = queryControlsOf(node);
  if (rail === null) throw new Error(`no toolbar is drawn for ${node.dataset['id'] ?? 'the node'}`);
  return rail;
};

/** One named command of a Resource, or null when the Resource offers none by that name. */
const queryCommand = (node: HTMLElement, name: RegExp | string): HTMLElement | null => {
  const rail = queryControlsOf(node);
  return rail === null ? null : within(rail).queryByRole('button', { name });
};

/** Put the Space Resource into portal Edit so its embedded Map can be authored. */
const beginPortalEdit = (parent: HTMLElement): void => {
  fireEvent.click(within(controlsOf(parent)).getByRole('button', { name: /^Edit Resource/ }));
};

/** An embedded Resource drawn by a named Space Resource rather than by `SPACE_RESOURCE_ID`. */
const embeddedNodeOf = (parentId: ResourceId, resourceId: ResourceId): HTMLElement => {
  const node = document.querySelector(
    `.react-flow__node[data-id="${embeddedNodeId(parentId, resourceId)}"]`,
  );
  if (!(node instanceof HTMLElement))
    throw new Error(`no embedded node is drawn for ${resourceId} under ${parentId}`);
  return node;
};

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
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

describe('the Map an Open Space Resource draws', () => {
  it.each(['failed', 'conflicted'] as const)(
    'reports embedded %s persistence on its target entry and exposes recovery only there',
    async (kind) => {
      const value = home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      });
      const control = new MemorySpaceBackendTestControl();
      const backend = new MemorySpaceBackend(
        META_ID,
        [meta, value, target].map((snapshot) => ({
          snapshot,
          revision: 0n,
          exportedRevision: null,
        })),
        control,
      );
      const spaces = createOpenSpaces({
        backend,
        metaSpaceId: META_ID,
        metaSpaceTitle: meta.document.title,
        newId: newUuid,
        history: recordingHistory(),
      });
      const initial = await spaces.open(HOME_ID);
      render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
      await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
      beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
      const remote = { ...target, document: { ...target.document, title: 'Remote Architecture' } };
      control.queueResult(
        kind === 'failed'
          ? { kind: 'retryable-failure', code: 'network' }
          : {
              kind: 'conflict',
              conflicts: [
                {
                  spaceId: TARGET_ID,
                  current: { snapshot: remote, revision: 1n, exportedRevision: null },
                },
              ],
            },
      );
      fireEvent.click(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Open Resource/ }),
      );
      await waitFor(() =>
        expect(spaces.entry(TARGET_ID)?.session.getState().persistence.kind).toBe(kind),
      );
      openSpacesMenu();
      const targetEntry = openSpaceRow(/Architecture/);
      expect(
        within(targetEntry).getByText(kind === 'failed' ? 'Save failed' : 'Save conflict'),
      ).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(initial.session.getState().working).toEqual(value);
      expect(spaces.getState().activeSpaceId).toBe(HOME_ID);

      fireEvent.click(targetEntry);
      await waitFor(() => expect(spaces.getState().activeSpaceId).toBe(TARGET_ID));
      if (kind === 'failed') {
        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
      } else {
        const dialog = await screen.findByRole('alertdialog', { name: 'Changes conflict' });
        expect(within(dialog).getByRole('button', { name: 'Keep local and retry' })).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Reload' }));
      }
      await waitFor(() =>
        expect(spaces.entry(TARGET_ID)?.session.getState().persistence.kind).toBe('settled'),
      );
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(initial.session.getState().working).toEqual(value);
      if (kind === 'conflicted')
        expect(spaces.entry(TARGET_ID)?.session.getState().working).toEqual(remote);
    },
  );

  /**
   * A refused rail rename is answered twice, each by its owner: the editor
   * holds the draft open on the sentence, and the containing canvas's command
   * outcomes hold the report as "Map unchanged" until it is dismissed.
   */
  it('holds a refused rail Map rename open and reports it on the containing Space', async () => {
    const session = await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    fireEvent.click(
      within(controlsOf(containingNode(SPACE_RESOURCE_ID))).getByTestId('space-resource-map'),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const editor = await screen.findByRole('textbox', { name: 'Map name' });
    fireEvent.change(editor, { target: { value: '' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveAccessibleDescription(
      'A Map title is required.',
    );
    const dismiss = await screen.findByRole('button', { name: 'Dismiss: Map unchanged' });
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByText('Map unchanged')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Map name' })).toBeInTheDocument();
    expect(session.getState().working.resources).toHaveLength(2);
  });

  /**
   * A refused rail Graph rename is answered as a Map rename is: the editor
   * holds the draft open, and the containing canvas's command outcomes hold
   * the report as "Graph unchanged". The rail says no sentence of its own.
   */
  it('holds a refused rail Graph rename open and reports it on the containing Space', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    fireEvent.click(
      within(controlsOf(containingNode(SPACE_RESOURCE_ID))).getByTestId('space-resource-graph'),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const editor = await screen.findByRole('textbox', { name: 'Graph name' });
    fireEvent.change(editor, { target: { value: '' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(screen.getByRole('textbox', { name: 'Graph name' })).toHaveAccessibleDescription(
      'A Graph title is required.',
    );
    const dismiss = await screen.findByRole('button', { name: 'Dismiss: Graph unchanged' });
    expect(screen.getAllByText('A Graph title is required.')).toHaveLength(2);
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByText('Graph unchanged')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Graph name' })).toBeInTheDocument();
  });

  /**
   * A refused rail Map deletion is said once, by the containing canvas's
   * command outcomes: the rail reports no sentence of its own beside the
   * notice, whose dismissal would otherwise leave a second copy behind.
   *
   * Refused through a spy on the target's Space Resource lifecycle, because
   * its refusals are races or recovery states no mount can stage.
   */
  it('says a refused rail Map deletion once, as the containing Space’s notice', async () => {
    const { spaces } = await mountOpenSpaces(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    const entry = spaces.entry(TARGET_ID);
    if (entry === undefined) throw new Error('the target is not embedded');
    vi.spyOn(entry.spaceResources, 'deleteMap').mockResolvedValue({
      kind: 'refused',
      refusal: { code: 'map-not-found', mapId: SELECTED_MAP_ID },
    });
    fireEvent.click(
      within(controlsOf(containingNode(SPACE_RESOURCE_ID))).getByTestId('space-resource-map'),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Collection 1' }));

    const dismiss = await screen.findByRole('button', { name: 'Dismiss: Map not deleted' });
    await waitFor(() =>
      expect(
        within(controlsOf(containingNode(SPACE_RESOURCE_ID))).getByTestId('space-resource-map'),
      ).toBeEnabled(),
    );
    expect(screen.getAllByText('This Map is no longer part of the Space.')).toHaveLength(1);
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByText('Map not deleted')).not.toBeInTheDocument());
    expect(screen.queryByText('This Map is no longer part of the Space.')).not.toBeInTheDocument();
    expect(entry.app.currentSpace().maps).toHaveLength(2);
  });

  it('keeps the embedded Map inert until Edit, and Done returns it to Read', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    await mount(value);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    expect(queryCommand(embeddedNode(DRAWN_A), /Edit Resource/)).toBeNull();
    const parent = containingNode(SPACE_RESOURCE_ID);
    expect(within(controlsOf(parent)).getByRole('button', { name: /Edit Resource/ })).toBeTruthy();
    beginPortalEdit(parent);
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
    expect(within(controlsOf(parent)).getByRole('button', { name: /Done Resource/ })).toBeTruthy();
    fireEvent.click(within(controlsOf(parent)).getByRole('button', { name: /Done Resource/ }));
    await waitFor(() => expect(queryCommand(embeddedNode(DRAWN_A), /Edit Resource/)).toBeNull());
    expect(within(controlsOf(parent)).getByRole('button', { name: /Edit Resource/ })).toBeTruthy();
  });

  /**
   * The canvas root captures wheel to author framing. ADR 0064
   * forbids `nowheel` on an Open Resource, so the editing Space Resource must not
   * take that class — the capture listener is the wheel, not a hole in the
   * host viewport.
   */
  it('does not put nowheel on an Open Space Resource in portal Edit, and wheel still authors its framing', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const session = await mount(value);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
    const parent = containingNode(SPACE_RESOURCE_ID);
    expect(parent.className.split(/\s+/)).not.toContain('nowheel');
    fireEvent.wheel(parent, { deltaY: -120, bubbles: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 180));
    });
    const resource = session
      .getState()
      .working.resources.find((candidate) => candidate.id === SPACE_RESOURCE_ID);
    if (resource?.document.kind !== 'space') throw new Error('Space Resource missing');
    expect(resource.document.framing?.zoom).toBe(1.1);
  });

  /**
   * Portal Edit keeps `editingPortals` populated after Present or a chrome
   * rename withdraws canvas authoring. Wheel must not keep writing framing.
   */
  it('does not author portal framing from wheel while presenting', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const session = await mount({
      ...value,
      document: {
        ...value.document,
        maps: value.document.maps?.map((map) => ({
          ...map,
          graphs: map.graphs.map((graph) => ({
            ...graph,
            edges: [{ from: HOME_RESOURCE_ID, to: SPACE_RESOURCE_ID }],
          })),
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
    fireEvent.click(anyPresentControl());
    await waitFor(() => expect(screen.getByTestId('presenting-chrome')).toBeVisible());
    fireEvent.wheel(containingNode(SPACE_RESOURCE_ID), { deltaY: -120, bubbles: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 180));
    });
    const resource = session
      .getState()
      .working.resources.find((candidate) => candidate.id === SPACE_RESOURCE_ID);
    if (resource?.document.kind !== 'space') throw new Error('Space Resource missing');
    expect(resource.document.framing).toBeUndefined();
  });

  it('does not author portal framing from wheel during a chrome Space rename', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const session = await mount(value);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
    openSpaceMenu('Home');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(screen.getByRole('textbox', { name: 'Space name' })).toBeTruthy();
    fireEvent.wheel(containingNode(SPACE_RESOURCE_ID), { deltaY: -120, bubbles: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 180));
    });
    const resource = session
      .getState()
      .working.resources.find((candidate) => candidate.id === SPACE_RESOURCE_ID);
    if (resource?.document.kind !== 'space') throw new Error('Space Resource missing');
    expect(resource.document.framing).toBeUndefined();
  });

  /**
   * Two host Space Resources, both Open, both in portal Edit. Wheel is debounced
   * 160 ms so a burst on one portal is one Edit; a burst that crosses two
   * portals must still author each. A canvas-root listener with a single
   * pending slot would drop the first portal's framing when the second wheel
   * arrived inside the window.
   */
  it('authors framing on each Space Resource wheeled within the debounce window', async () => {
    const spaceResource: Extract<ResourceDocument, { kind: 'space' }> = {
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    };
    const value = home(spaceResource);
    const session = await mount({
      ...value,
      resources: value.resources.map((resource) =>
        resource.id === HOME_RESOURCE_ID ? { ...resource, document: spaceResource } : resource,
      ),
      document: {
        ...value.document,
        maps: value.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [HOME_RESOURCE_ID]: { x: 10, y: 20, open: true, openSize: { width: 700, height: 500 } },
          },
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    await waitFor(() => expect(embeddedNodeOf(HOME_RESOURCE_ID, DRAWN_A)).toBeTruthy());
    const first = containingNode(SPACE_RESOURCE_ID);
    const second = containingNode(HOME_RESOURCE_ID);
    beginPortalEdit(first);
    beginPortalEdit(second);
    await waitFor(() => {
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy();
      expect(
        within(controlsOf(embeddedNodeOf(HOME_RESOURCE_ID, DRAWN_A))).getByRole('button', {
          name: /Edit Resource/,
        }),
      ).toBeTruthy();
    });
    fireEvent.wheel(first, { deltaY: -120, bubbles: true });
    fireEvent.wheel(second, { deltaY: -120, bubbles: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 180));
    });
    const authoredZoom = (resourceId: ResourceId): number | undefined => {
      const resource = session
        .getState()
        .working.resources.find((candidate) => candidate.id === resourceId);
      if (resource?.document.kind !== 'space') throw new Error('Space Resource missing');
      return resource.document.framing?.zoom;
    };
    expect(authoredZoom(SPACE_RESOURCE_ID)).toBe(1.1);
    expect(authoredZoom(HOME_RESOURCE_ID)).toBe(1.1);
  });

  /**
   * Unmounting while a wheel is still pending must not leave the framing only
   * in portalDraft: cleanup flushes what has not landed.
   */
  it('persists a pending portal zoom when the canvas unmounts before the debounce', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    const { unmount } = render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
    fireEvent.wheel(containingNode(SPACE_RESOURCE_ID), { deltaY: -120, bubbles: true });
    unmount();
    const resource = initial.session
      .getState()
      .working.resources.find((candidate) => candidate.id === SPACE_RESOURCE_ID);
    if (resource?.document.kind !== 'space') throw new Error('Space Resource missing');
    expect(resource.document.framing?.zoom).toBe(1.1);
  });

  it('keeps an embedded draft safe from containing controls and sibling editors', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    await mount({
      ...value,
      document: {
        ...value.document,
        maps: value.document.maps?.map((map) => ({
          ...map,
          graphs: map.graphs.map((graph) => ({
            ...graph,
            edges: [{ from: HOME_RESOURCE_ID, to: SPACE_RESOURCE_ID }],
          })),
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    expect(unavailable(anyPresentControl())).toBe(false);
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    fireEvent.click(
      within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
    );
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Save/ }),
      ).toBeTruthy(),
    );
    const parent = document.querySelector(`.react-flow__node[data-id="${SPACE_RESOURCE_ID}"]`);
    if (!(parent instanceof HTMLElement)) throw new Error('Space Resource missing');
    expect(within(controlsOf(parent)).queryByRole('button', { name: /Close Resource/ })).toBeNull();
    expect(
      within(controlsOf(parent)).getByTestId('space-resource-map').getAttribute('aria-disabled') ===
        'true',
    ).toBe(true);
    const sibling = document.querySelector(`.react-flow__node[data-id="${HOME_RESOURCE_ID}"]`);
    if (!(sibling instanceof HTMLElement)) throw new Error('Containing Markdown Resource missing');
    expect(queryCommand(sibling, /Edit Resource/)).toBeNull();
    expect(queryCommand(embeddedNode(DRAWN_B), /Edit Resource/)).toBeNull();
    expect(unavailable(anyPresentControl())).toBe(true);
    fireEvent.click(
      within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Cancel/ }),
    );
    await waitFor(() =>
      expect(
        within(controlsOf(parent)).getByRole('button', { name: /Close Resource/ }),
      ).toBeTruthy(),
    );
  });

  it('allows only one content editor across two embeddings of the same target', async () => {
    const document: ResourceDocument = {
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    };
    const value = home(document);
    await mount({
      ...value,
      resources: value.resources.map((resource) =>
        resource.id === HOME_RESOURCE_ID ? { ...resource, document } : resource,
      ),
      document: {
        ...value.document,
        maps: value.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [HOME_RESOURCE_ID]: { x: 10, y: 20, open: true, openSize: { width: 700, height: 500 } },
          },
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    beginPortalEdit(containingNode(HOME_RESOURCE_ID));
    fireEvent.click(
      within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
    );
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Save/ }),
      ).toBeTruthy(),
    );
    const duplicate = window.document.querySelector(
      `.react-flow__node[data-id="${embeddedNodeId(HOME_RESOURCE_ID, DRAWN_A)}"]`,
    );
    if (!(duplicate instanceof HTMLElement)) throw new Error('Duplicate embedded Resource missing');
    expect(queryCommand(duplicate, /Edit Resource/)).toBeNull();
    expect(queryCommand(duplicate, /Save/)).toBeNull();
    fireEvent.click(
      within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Cancel/ }),
    );
    await waitFor(() =>
      expect(
        within(controlsOf(duplicate)).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
  });

  /**
   * The two questions the containing canvas asks of one live embedded edit,
   * pinned together because they are read from one Set by different halves of
   * it. *Is any* embedding editing withdraws this canvas's own Resource controls
   * and every other embedding; *which* embedding is editing is what leaves the
   * one that owns the caret its editor.
   *
   * Driven through a **title** edit rather than a content edit, because that is
   * the arm the membership half is load-bearing for: a live content editor
   * survives its canvas being withdrawn (ADR 0064), so withdrawing every
   * embedding would still leave Save and Cancel standing and prove nothing. A
   * title caret is dropped the moment its canvas loses `authorOnCanvas`, so it
   * is gone the instant the editing embedding is withdrawn along with the rest.
   *
   * A single-embedding mount cannot tell the two halves apart either, so this
   * fixture draws the same target twice, from two Open Space Resources of the
   * containing Map.
   */
  it('withdraws the containing canvas for a live embedded edit and leaves that embedding its own', async () => {
    const spaceResource: ResourceDocument = {
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    };
    const value = home(spaceResource);
    await mount({
      ...value,
      resources: value.resources.map((resource) =>
        resource.id === HOME_RESOURCE_ID ? { ...resource, document: spaceResource } : resource,
      ),
      document: {
        ...value.document,
        maps: value.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [HOME_RESOURCE_ID]: { x: 10, y: 20, open: true, openSize: { width: 700, height: 500 } },
          },
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    const editing = containingNode(SPACE_RESOURCE_ID);
    const other = containingNode(HOME_RESOURCE_ID);
    beginPortalEdit(editing);
    beginPortalEdit(other);
    const otherEmbedded = embeddedNodeOf(HOME_RESOURCE_ID, DRAWN_A);
    expect(
      within(controlsOf(editing)).getByRole('button', { name: /Close Resource/ }),
    ).toBeTruthy();
    expect(within(controlsOf(other)).getByRole('button', { name: /Close Resource/ })).toBeTruthy();
    expect(within(otherEmbedded).getByRole('button', { name: 'Edit Title Intake' })).toBeTruthy();

    fireEvent.click(
      within(embeddedNode(DRAWN_A)).getByRole('button', { name: 'Edit Title Intake' }),
    );
    await waitFor(() =>
      expect(
        within(embeddedNode(DRAWN_A)).getByRole('textbox', { name: 'Resource title' }),
      ).toBeTruthy(),
    );

    // The embedding that owns the caret keeps its editor.
    expect(
      within(embeddedNode(DRAWN_A)).getByRole('textbox', { name: 'Resource title' }),
    ).toBeTruthy();
    // Every containing Resource control goes, on the Space Resource holding the edit
    // and on its sibling alike, and so does the other embedding's own.
    expect(
      within(controlsOf(editing)).queryByRole('button', { name: /Close Resource/ }),
    ).toBeNull();
    expect(
      within(controlsOf(editing))
        .getByTestId('space-resource-map')
        .getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(within(controlsOf(other)).queryByRole('button', { name: /Close Resource/ })).toBeNull();
    expect(
      within(controlsOf(other)).getByTestId('space-resource-map').getAttribute('aria-disabled') ===
        'true',
    ).toBe(true);
    expect(within(otherEmbedded).queryByRole('button', { name: 'Edit Title Intake' })).toBeNull();

    fireEvent.keyDown(
      within(embeddedNode(DRAWN_A)).getByRole('textbox', { name: 'Resource title' }),
      {
        key: 'Escape',
      },
    );
    await waitFor(() =>
      expect(
        within(controlsOf(editing)).getByRole('button', { name: /Close Resource/ }),
      ).toBeTruthy(),
    );
    expect(within(controlsOf(other)).getByRole('button', { name: /Close Resource/ })).toBeTruthy();
    expect(within(otherEmbedded).getByRole('button', { name: 'Edit Title Intake' })).toBeTruthy();
  });

  it('reclips the retained drawing when its containing Resource resizes after Exit', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_B)).not.toBeNull());
    const previous = embeddedNode(DRAWN_B).style.clipPath;
    await act(async () => {
      await spaces.exit(TARGET_ID);
    });
    act(() => {
      initial.app.authoring.complete({
        kind: 'resized-resource',
        resourceId: SPACE_RESOURCE_ID,
        size: { width: 400, height: 400 },
      });
    });
    await waitFor(() => expect(embeddedNode(DRAWN_B).style.clipPath).not.toBe(previous));
    expect(spaces.entry(TARGET_ID)).toBeUndefined();
    expect(queryCommand(embeddedNode(DRAWN_B), /Edit Resource/)).toBeNull();
    await waitFor(() => expect(initial.session.getState().persistence.kind).toBe('settled'));
  });

  /**
   * Delete answers a retained read the way Enter and F2 do.
   *
   * The canvas tells assistive technology that backspace or delete removes the
   * focused Resource from its Map, and the read-only drawing left behind by Exit
   * is still focusable. The other two Resource commands aimed at that drawing —
   * `onEditResource` and `onBeginTitleEditing` — reopen the target's session so the
   * next press acts; the deletion command consumed the key and answered
   * nothing, so the press did not remove the Resource, did not reopen the target and
   * left no sentence behind either.
   */
  it('reopens the retained embedding when Delete is aimed at its read-only Resource', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_B)).not.toBeNull());
    await act(async () => {
      await spaces.exit(TARGET_ID);
    });
    expect(spaces.entry(TARGET_ID)).toBeUndefined();
    fireEvent.keyDown(embeddedNode(DRAWN_B), { key: 'Delete', bubbles: true });
    await waitFor(() => expect(spaces.entry(TARGET_ID)).not.toBeUndefined());
    // The press reopens the target and removes nothing — neither the read-only
    // Resource from the target Map nor the containing Space Resource it is drawn in.
    expect(
      spaces
        .entry(TARGET_ID)
        ?.session.getState()
        .working.document.maps?.find((map) => map.id === SELECTED_MAP_ID)?.positions,
    ).toHaveProperty(DRAWN_B);
    expect(
      initial.session
        .getState()
        .working.resources.some((resource) => resource.id === SPACE_RESOURCE_ID),
    ).toBe(true);
  });

  it('protects every containing Space Resource while a nested target owns the editor', async () => {
    const thirdId = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
    const thirdMap = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
    const thirdGraph = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
    const thirdResource = uuidSchema.parse('00000000-0000-4000-8000-000000000033');
    const third = spaceSnapshotSchema.parse({
      id: thirdId,
      document: {
        version: 1,
        title: 'Nested target',
        defaultMap: thirdMap,
        maps: [
          {
            id: thirdMap,
            title: 'Nested Map',
            kind: 'positioned',
            positions: { [thirdResource]: { x: 0, y: 0, open: false } },
            graphs: [{ id: thirdGraph, title: 'Nested Graph', edges: [] }],
          },
        ],
      },
      resources: [
        { id: thirdResource, document: { title: 'Nested content', kind: 'markdown', body: '' } },
      ],
    });
    const nestedTarget = spaceSnapshotSchema.parse({
      ...target,
      resources: target.resources.map((resource) =>
        resource.id === DRAWN_B
          ? {
              ...resource,
              document: {
                title: 'Deeper',
                kind: 'space',
                spaceId: thirdId,
                map: thirdMap,
                graph: thirdGraph,
              },
            }
          : resource,
      ),
      document: {
        ...target.document,
        maps: target.document.maps?.map((map) =>
          map.id !== SELECTED_MAP_ID
            ? map
            : {
                ...map,
                positions: {
                  ...map.positions,
                  [DRAWN_B]: { x: 264, y: 0, open: true, openSize: { width: 700, height: 500 } },
                },
              },
        ),
      },
    });
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, nestedTarget, third].map((snapshot) => ({
        snapshot,
        revision: 0n,
        exportedRevision: null,
      })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    const nested = () => {
      const element = document.querySelector(
        `.react-flow__node[data-id="${embeddedNodeId(embeddedNodeId(SPACE_RESOURCE_ID, DRAWN_B), thirdResource)}"]`,
      );
      if (!(element instanceof HTMLElement)) throw new Error('Nested Resource missing');
      return element;
    };
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    await waitFor(() =>
      expect(
        within(controlsOf(nested())).getByRole('button', { name: /Edit Resource/ }),
      ).toBeTruthy(),
    );
    fireEvent.click(within(controlsOf(nested())).getByRole('button', { name: /Edit Resource/ }));
    await waitFor(() =>
      expect(within(controlsOf(nested())).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    // The nested Space Resource is neither selected nor in portal Edit, and the
    // live edit withdraws selection from the canvases around it, so pressing it
    // draws no toolbar at all: neither its Close nor its Map choice can be reached.
    expect(queryControlsOf(embeddedNode(DRAWN_B))).toBeNull();
    const outer = document.querySelector(`.react-flow__node[data-id="${SPACE_RESOURCE_ID}"]`);
    if (!(outer instanceof HTMLElement)) throw new Error('Outer Resource missing');
    expect(within(controlsOf(outer)).queryByRole('button', { name: /Close Resource/ })).toBeNull();
    fireEvent.click(within(controlsOf(nested())).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(
        within(controlsOf(embeddedNode(DRAWN_B))).getByRole('button', { name: /Close Resource/ }),
      ).toBeTruthy(),
    );
  });

  /**
   * Closing a Space Resource ends its read, and reopening starts a new one.
   *
   * The drawing left behind by an *Exit* is deliberately retained — the target
   * is gone and a read-only picture of it is better than a hole. A Close is the
   * other case: the embedding unmounts with its target still open, so the next
   * Open composes a fresh one, and anything the previous composition published
   * describes a Map nobody is reading any more. Held here through the one
   * consequence that outlives the frame: the retained drawing says a nested
   * Space Resource is Open, so reopening embeds a Space the target has since closed.
   */
  it('forgets what a Closed Space Resource read, so reopening embeds nothing it held', async () => {
    const thirdId = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
    const thirdMap = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
    const thirdGraph = uuidSchema.parse('00000000-0000-4000-8000-000000000042');
    const thirdResource = uuidSchema.parse('00000000-0000-4000-8000-000000000043');
    const third = spaceSnapshotSchema.parse({
      id: thirdId,
      document: {
        version: 1,
        title: 'Nested target',
        defaultMap: thirdMap,
        maps: [
          {
            id: thirdMap,
            title: 'Nested Map',
            kind: 'positioned',
            positions: { [thirdResource]: { x: 0, y: 0, open: false } },
            graphs: [{ id: thirdGraph, title: 'Nested Graph', edges: [] }],
          },
        ],
      },
      resources: [
        { id: thirdResource, document: { title: 'Nested content', kind: 'markdown', body: '' } },
      ],
    });
    const nestedTarget = spaceSnapshotSchema.parse({
      ...target,
      resources: target.resources.map((resource) =>
        resource.id === DRAWN_B
          ? {
              ...resource,
              document: {
                title: 'Deeper',
                kind: 'space',
                spaceId: thirdId,
                map: thirdMap,
                graph: thirdGraph,
              },
            }
          : resource,
      ),
      document: {
        ...target.document,
        maps: target.document.maps?.map((map) =>
          map.id !== SELECTED_MAP_ID
            ? map
            : {
                ...map,
                positions: {
                  ...map.positions,
                  [DRAWN_B]: { x: 264, y: 0, open: true, openSize: { width: 700, height: 500 } },
                },
              },
        ),
      },
    });
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, nestedTarget, third].map((snapshot) => ({
        snapshot,
        revision: 0n,
        exportedRevision: null,
      })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() => expect(spaces.entry(thirdId)).not.toBeUndefined());

    // Close the containing Space Resource while the nested one is still Open, so
    // the read it leaves behind describes a Map that is about to change.
    act(() => {
      initial.app.authoring.complete({ kind: 'closed-resource', resourceId: SPACE_RESOURCE_ID });
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).toBeNull());
    const targetEntry = spaces.entry(TARGET_ID);
    if (targetEntry === undefined) throw new Error('the target is not open');
    act(() => {
      targetEntry.app.authoring.completeInMap(SELECTED_MAP_ID, {
        kind: 'closed-resource',
        resourceId: DRAWN_B,
      });
    });
    await act(async () => {
      await spaces.exit(thirdId);
    });
    expect(spaces.entry(thirdId)).toBeUndefined();

    act(() => {
      initial.app.authoring.complete({ kind: 'opened-resource', resourceId: SPACE_RESOURCE_ID });
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    for (let settle = 0; settle < 4; settle += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(spaces.entry(thirdId)).toBeUndefined();
  }, 20000);

  it('stops embedding a Space Resource whose Map is already on the containing path', async () => {
    // Home embeds the target, and the target embeds Home back. Neither Resource is
    // a self-reference, so single-Space intake accepts both (`validate.ts` only
    // refuses `resource.spaceId === space.id`); nothing but this guard stops the
    // pair nesting one level deeper on every commit.
    const mutualTarget = spaceSnapshotSchema.parse({
      ...target,
      resources: target.resources.map((resource) =>
        resource.id === DRAWN_B
          ? {
              ...resource,
              document: {
                title: 'Back to Home',
                kind: 'space',
                spaceId: HOME_ID,
                map: HOME_MAP_ID,
                graph: HOME_GRAPH_ID,
              },
            }
          : resource,
      ),
      document: {
        ...target.document,
        maps: target.document.maps?.map((map) =>
          map.id !== SELECTED_MAP_ID
            ? map
            : {
                ...map,
                positions: {
                  ...map.positions,
                  [DRAWN_B]: { x: 264, y: 0, open: true, openSize: { width: 700, height: 500 } },
                },
              },
        ),
      },
    });
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, mutualTarget].map((snapshot) => ({
        snapshot,
        revision: 0n,
        exportedRevision: null,
      })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    const query = (id: string): Element | null =>
      document.querySelector(`.react-flow__node[data-id="${id}"]`);
    // Home drawn inside the target, one hop back — that much is ordinary nesting.
    const returned = embeddedNodeId(embeddedNodeId(SPACE_RESOURCE_ID, DRAWN_B), SPACE_RESOURCE_ID);
    // The second crossing of `TARGET:SELECTED_MAP` is the cycle. Without the
    // guard each settle adds another level, so this loop never stops growing.
    const repeated = embeddedNodeId(returned, DRAWN_A);
    for (let settle = 0; settle < 12; settle += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(query(returned)).not.toBeNull();
    expect(query(repeated)).toBeNull();
  }, 20000);

  it('edits the target through the Open Resource without changing the containing Space', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      map: SELECTED_MAP_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    fireEvent.click(
      within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Edit Resource/ }),
    );
    await waitFor(() =>
      expect(
        spaces
          .entry(TARGET_ID)
          ?.session.getState()
          .working.document.maps?.find((map) => map.id === SELECTED_MAP_ID)?.positions[DRAWN_A]
          ?.open,
      ).toBe(true),
    );
    expect(
      within(controlsOf(embeddedNode(DRAWN_A))).getByRole('button', { name: /Save/ }),
    ).toBeTruthy();
    expect(initial.session.getState().working).toEqual(value);
    expect(spaces.getState().activeSpaceId).toBe(HOME_ID);
  });

  /**
   * The Resource's selection, and not the target's own.
   *
   * `Collection 2` is the target Space's `defaultMap` and holds
   * `Elsewhere entirely`; the Resource selects `Collection 1`. Asserting the
   * absence beside the presence is what makes this a statement about *whose*
   * selection was read rather than about whether anything was drawn.
   */
  it('draws the Map the Resource selects, not the target own default', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );

    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    expect(queryEmbeddedNode(DRAWN_B)).not.toBeNull();
    expect(queryEmbeddedNode(UNPLACED)).toBeNull();
    expect(screen.getByText('Intake')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Elsewhere entirely' })).toBeNull();
  });

  /**
   * The canvas hands React Flow the table with the embedded Edge type in it.
   *
   * React Flow draws a type its table lacks with its default curve and names the
   * fallback in the Edge's class, so the class is what tells the routed Edge from
   * the fallback here. `embedded-map.test.ts` ('registers every Edge type it mints
   * in the canvas table, drawn as the routed Edge') holds that the registration
   * draws that type with `RoutedEdge`; this holds that `SpaceCanvas` spends it.
   */
  it('draws an embedded Edge with the type the embedding registers', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );

    const embeddedEdges = () => [
      ...document.querySelectorAll(`.react-flow__edge[data-id^="${SPACE_RESOURCE_ID}:"]`),
    ];
    await waitFor(() => expect(embeddedEdges()).toHaveLength(1));
    const edges = embeddedEdges();
    expect(edges[0]).toHaveClass(`react-flow__edge-${EMBEDDED_EDGE_TYPE}`);
    expect(edges[0]).not.toHaveClass('react-flow__edge-default');
  });

  /**
   * The containing Map owns the Space Resource's rect and the target Space owns
   * everything inside it, so a child is parented to the Resource and confined to
   * it — which is React Flow's own nesting contract and what makes moving the
   * Space Resource move the view with it.
   */
  it('parents the drawn Resources to the Space Resource', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SELECTED_MAP_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );

    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    beginPortalEdit(containingNode(SPACE_RESOURCE_ID));
    // React Flow renders a child as a sibling of its parent and offsets it by
    // the parent origin, so the parenting is read off the store rather than off
    // the DOM tree. What the DOM does carry is the refusal: no rail, and so no
    // control that could author another Space from this canvas (ADR 0040).
    const drawn = embeddedNode(DRAWN_A);
    expect(within(controlsOf(drawn)).getByRole('button', { name: /Open Resource/ })).toBeTruthy();
    // Portal Edit publishes the same connection authoring the host canvas does:
    // `connectionAuthoringEnabled: true` and the eight labelled handles
    // (ADR 0087).
    expect(drawn.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'true',
    );
    const handles = [...drawn.querySelectorAll('.rf-resource-node__authoring-handle')];
    expect(handles).toHaveLength(8);
    expect(
      handles.every((handle) =>
        /^Connect (from|to) /.test(handle.getAttribute('aria-label') ?? ''),
      ),
    ).toBe(true);
  });

  /**
   * The one state that draws no view.
   *
   * A Space Resource selects a Map from the moment it exists (ADR 0079), so a
   * pair resolving to nothing means the Map it names was
   * deleted out from under it. The Resource has neither failed nor is it waiting:
   * its target read, so both selectors are drawn over the Maps that do
   * exist, and the only missing entity is the one it points at.
   */
  it('draws no view for a Resource whose selected Map the target no longer holds', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: DELETED_MAP_ID,
        graph: DELETED_GRAPH_ID,
      }),
    );

    await waitFor(() => expect(containingNode(SPACE_RESOURCE_ID)).toBeTruthy());
    expect(
      within(controlsOf(containingNode(SPACE_RESOURCE_ID))).getByTestId('space-resource-map'),
    ).toBeTruthy();
    expect(queryEmbeddedNode(DRAWN_A)).toBeNull();
    expect(queryEmbeddedNode(UNPLACED)).toBeNull();
  });

  /**
   * Home over two Spaces the backend does not hold, and one it does.
   *
   * The unreadable pair is what separates a failure *per target* from one
   * sentence for the whole canvas; the third Resource starts Closed so its
   * successful read happens after both refusals, on a press the author makes.
   */
  const unreadable = (): SpaceSnapshot =>
    spaceSnapshotSchema.parse({
      id: HOME_ID,
      document: {
        version: 1,
        title: 'Home',
        maps: [
          {
            id: HOME_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: {
              [HOME_RESOURCE_ID]: { x: 10, y: 20, open: false },
              [GONE_A_RESOURCE_ID]: {
                x: 600,
                y: 20,
                open: true,
                openSize: { width: 700, height: 500 },
              },
              [GONE_B_RESOURCE_ID]: {
                x: 1400,
                y: 20,
                open: true,
                openSize: { width: 700, height: 500 },
              },
              [SPACE_RESOURCE_ID]: { x: 2200, y: 20, open: false },
            },
            graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
          },
        ],
        defaultMap: HOME_MAP_ID,
      },
      resources: [
        { id: HOME_RESOURCE_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
        {
          id: GONE_A_RESOURCE_ID,
          document: {
            // Two Title Lines, so the sentence below is read for the name
            // it names the Resource by rather than for the whole Title (ADR 0083).
            title: 'First gone\nA Space that left',
            kind: 'space',
            spaceId: GONE_A_ID,
            map: GONE_MAP_ID,
            graph: GONE_GRAPH_ID,
          },
        },
        {
          id: GONE_B_RESOURCE_ID,
          document: {
            title: 'Second gone',
            kind: 'space',
            spaceId: GONE_B_ID,
            map: GONE_MAP_ID,
            graph: GONE_GRAPH_ID,
          },
        },
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Elsewhere',
            kind: 'space',
            spaceId: TARGET_ID,
            map: SELECTED_MAP_ID,
            graph: SELECTED_GRAPH_ID,
          },
        },
      ],
    });

  /**
   * A failed read belongs to the embedding that asked for it.
   *
   * One string for the whole canvas would break both: only one of two
   * unreadable targets would ever be announced, the sentence would name neither
   * Resource, and a third Resource opening successfully would erase whichever
   * one was on screen.
   */
  it('names each target it could not read and keeps one failure clear of another', async () => {
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, unreadable(), target].map((snapshot) => ({
        snapshot,
        revision: 0n,
        exportedRevision: null,
      })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    const first = await screen.findByText(new RegExp(GONE_A_ID));
    expect(first.textContent).toContain('First gone:');
    // The Resource's name and no more of its Title: this is one sentence, and a
    // line break inside it would draw as a broken-looking label.
    expect(first.textContent).not.toContain('A Space that left');
    expect((await screen.findByText(new RegExp(GONE_B_ID))).textContent).toContain('Second gone');

    act(() => {
      initial.app.authoring.complete({ kind: 'opened-resource', resourceId: SPACE_RESOURCE_ID });
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    expect(screen.queryByText(new RegExp(GONE_A_ID))).not.toBeNull();
    expect(screen.queryByText(new RegExp(GONE_B_ID))).not.toBeNull();
  });

  /**
   * A target that cannot be read is asked once.
   *
   * The load effect re-runs whenever `embeddedRequests` changes identity, and
   * Open Spaces republishes its entries on every session change in every open
   * Space — so a claim released on failure would read an unreadable target
   * again on essentially every edit anywhere in the session, with no backoff.
   */
  it('asks a target it could not read once, whatever else changes in the session', async () => {
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, unreadable(), target].map((snapshot) => ({
        snapshot,
        revision: 0n,
        exportedRevision: null,
      })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      metaSpaceTitle: meta.document.title,
      newId: newUuid,
      history: recordingHistory(),
    });
    const attempts: UUID[] = [];
    const counted: OpenSpaces = {
      ...spaces,
      embed: (spaceId) => {
        attempts.push(spaceId);
        return spaces.embed(spaceId);
      },
    };
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={counted} initial={initial} />);
    await waitFor(() => expect(attempts).toEqual([GONE_A_ID, GONE_B_ID]));

    for (let edit = 0; edit < 5; edit += 1) {
      act(() => {
        initial.app.authoring.complete({
          kind: 'edited-resource',
          resourceId: HOME_RESOURCE_ID,
          document: { title: `Start here ${edit}`, kind: 'markdown', body: '' },
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(attempts).toEqual([GONE_A_ID, GONE_B_ID]);
  });
});
