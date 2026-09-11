import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  spaceSnapshotSchema,
  uuidSchema,
  type ThingDocument,
  type ThingId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type SpaceSession,
} from '@project/persistence';
import { embeddedNodeId } from '../src/embedded-diagram';
import { createOpenSpaces, type OpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { newUuid } from '@project/core';
import { anyPresentControl, openSpaceRow, openSpacesMenu, unavailable } from './command-dock';

/**
 * What an Open Space Thing *shows* (ADR 0068).
 *
 * `space-thing-selection.test.tsx` holds the two selections the Thing authors;
 * this file holds what those selections then draw. The two claims that matter
 * are that the Diagram drawn is the **Thing's** and never the target Space's own
 * — the target's `defaultDiagram` here is deliberately not the one the Thing
 * selects — and that target editing, draft ownership and retained reads remain
 * coherent inside the containing canvas as a sub flow.
 *
 * The application half of the evidence ADR 0052 requires; the Ladle half is
 * `stories/surfaces/space-thing-embedded-diagram.stories.tsx`.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SELECTED_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const SELECTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const DRAWN_A = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const DRAWN_B = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const UNPLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

/**
 * A Diagram and Graph of the target that the target does not hold: the dangling
 * selection left behind when the Diagram a Space Thing named is deleted.
 *
 * A Space Thing selects from the moment it exists (ADR 0079), so a stored pair
 * that resolves to nothing is this and never an unmade choice.
 */
const DELETED_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const DELETED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

/** Two Spaces no backend holds, each reached by a Space Thing of its own. */
const GONE_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const GONE_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000051');
const GONE_A_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000052');
const GONE_B_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000053');
const GONE_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000054');
const GONE_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000055');

/**
 * The target: two Diagrams over three Things, and the one the Thing selects is
 * **not** the Space's own `defaultDiagram`.
 *
 * That asymmetry is the fixture's whole job. With one Diagram, or with the
 * selected one also being the default, a Thing reading the target's own
 * selection would draw exactly what a Thing reading its own does.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    diagrams: [
      {
        id: SELECTED_DIAGRAM_ID,
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
        id: OTHER_DIAGRAM_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [UNPLACED]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultDiagram: OTHER_DIAGRAM_ID,
  },
  things: [
    { id: DRAWN_A, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: DRAWN_B, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: UNPLACED, document: { title: 'Elsewhere entirely', kind: 'markdown', body: '' } },
  ],
});

/** Home, holding one Space Thing the Diagram has already Opened (ADR 0064). */
const home = (spaceThing: Extract<ThingDocument, { kind: 'space' }>): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: HOME_ID,
    document: {
      version: 1,
      title: 'Home',
      diagrams: [
        {
          id: HOME_DIAGRAM_ID,
          title: 'Diagram 1',
          kind: 'positioned',
          positions: {
            [HOME_THING_ID]: { x: 10, y: 20, open: false },
            [SPACE_THING_ID]: {
              x: 600,
              y: 20,
              open: true,
              openSize: { width: 700, height: 500 },
            },
          },
          graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultDiagram: HOME_DIAGRAM_ID,
    },
    things: [
      { id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
      { id: SPACE_THING_ID, document: spaceThing },
    ],
  });

const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    diagrams: [
      {
        id: META_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [META_THING_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: META_DIAGRAM_ID,
  },
  things: [
    { id: META_THING_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        diagram: HOME_DIAGRAM_ID,
        graph: HOME_GRAPH_ID,
      },
    },
    {
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: OTHER_DIAGRAM_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
});

async function mount(value: SpaceSnapshot): Promise<SpaceSession> {
  const backend = new MemorySpaceBackend(
    META_ID,
    [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    backend,
    metaSpaceId: META_ID,
    newId: newUuid,
    history: recordingHistory(),
  });
  const initial = await spaces.open(HOME_ID);
  render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  return initial.session;
}

const queryEmbeddedNode = (thingId: ThingId): HTMLElement | null => {
  const node = document.querySelector(
    `.react-flow__node[data-id="${embeddedNodeId(SPACE_THING_ID, thingId)}"]`,
  );
  return node instanceof HTMLElement ? node : null;
};

/** The same query where its absence is a broken test rather than a claim. */
const embeddedNode = (thingId: ThingId): HTMLElement => {
  const node = queryEmbeddedNode(thingId);
  if (node === null) throw new Error(`no embedded node is drawn for ${thingId}`);
  return node;
};

/** A Thing of the *containing* Diagram, by the node the canvas draws it as. */
const containingNode = (thingId: ThingId): HTMLElement => {
  const node = document.querySelector(`.react-flow__node[data-id="${thingId}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`no node is drawn for ${thingId}`);
  return node;
};

/** An embedded Thing drawn by a named Space Thing rather than by `SPACE_THING_ID`. */
const embeddedNodeOf = (parentId: ThingId, thingId: ThingId): HTMLElement => {
  const node = document.querySelector(
    `.react-flow__node[data-id="${embeddedNodeId(parentId, thingId)}"]`,
  );
  if (!(node instanceof HTMLElement))
    throw new Error(`no embedded node is drawn for ${thingId} under ${parentId}`);
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

describe('the Diagram an Open Space Thing draws', () => {
  it.each(['failed', 'conflicted'] as const)(
    'reports embedded %s persistence on its target entry and exposes recovery only there',
    async (kind) => {
      const value = home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: SELECTED_DIAGRAM_ID,
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
        newId: newUuid,
        history: recordingHistory(),
      });
      const initial = await spaces.open(HOME_ID);
      render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
      await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
      const remote = { ...target, document: { ...target.document, title: 'Remote Architecture' } };
      control.queueResult(
        kind === 'failed'
          ? { kind: 'retryable-failure', code: 'network', message: 'Target is offline' }
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
      fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Open Thing/ }));
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

  it('keeps an embedded draft safe from containing controls and sibling editors', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      diagram: SELECTED_DIAGRAM_ID,
      graph: SELECTED_GRAPH_ID,
    });
    await mount({
      ...value,
      document: {
        ...value.document,
        diagrams: value.document.diagrams?.map((diagram) => ({
          ...diagram,
          graphs: diagram.graphs.map((graph) => ({
            ...graph,
            edges: [{ from: HOME_THING_ID, to: SPACE_THING_ID }],
          })),
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    expect(unavailable(anyPresentControl())).toBe(false);
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Thing/ }));
    await waitFor(() =>
      expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    const parent = document.querySelector(`.react-flow__node[data-id="${SPACE_THING_ID}"]`);
    if (!(parent instanceof HTMLElement)) throw new Error('Space Thing missing');
    expect(within(parent).queryByRole('button', { name: /Close Thing/ })).toBeNull();
    expect(within(parent).getByTestId('space-thing-diagram').hasAttribute('disabled')).toBe(true);
    const sibling = document.querySelector(`.react-flow__node[data-id="${HOME_THING_ID}"]`);
    if (!(sibling instanceof HTMLElement)) throw new Error('Containing Markdown Thing missing');
    expect(within(sibling).queryByRole('button', { name: /Edit Thing/ })).toBeNull();
    expect(within(embeddedNode(DRAWN_B)).queryByRole('button', { name: /Edit Thing/ })).toBeNull();
    expect(unavailable(anyPresentControl())).toBe(true);
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(within(parent).getByRole('button', { name: /Close Thing/ })).toBeTruthy(),
    );
  });

  it('allows only one content editor across two embeddings of the same target', async () => {
    const document: ThingDocument = {
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      diagram: SELECTED_DIAGRAM_ID,
      graph: SELECTED_GRAPH_ID,
    };
    const value = home(document);
    await mount({
      ...value,
      things: value.things.map((thing) =>
        thing.id === HOME_THING_ID ? { ...thing, document } : thing,
      ),
      document: {
        ...value.document,
        diagrams: value.document.diagrams?.map((diagram) => ({
          ...diagram,
          positions: {
            ...diagram.positions,
            [HOME_THING_ID]: { x: 10, y: 20, open: true, openSize: { width: 700, height: 500 } },
          },
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Thing/ }));
    await waitFor(() =>
      expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    const duplicate = window.document.querySelector(
      `.react-flow__node[data-id="${embeddedNodeId(HOME_THING_ID, DRAWN_A)}"]`,
    );
    if (!(duplicate instanceof HTMLElement)) throw new Error('Duplicate embedded Thing missing');
    expect(within(duplicate).queryByRole('button', { name: /Edit Thing/ })).toBeNull();
    expect(within(duplicate).queryByRole('button', { name: /Save/ })).toBeNull();
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(within(duplicate).getByRole('button', { name: /Edit Thing/ })).toBeTruthy(),
    );
  });

  /**
   * The two questions the containing canvas asks of one live embedded edit,
   * pinned together because they are read from one Set by different halves of
   * it. *Is any* embedding editing withdraws this canvas's own Thing controls
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
   * fixture draws the same target twice, from two Open Space Things of the
   * containing Diagram.
   */
  it('withdraws the containing canvas for a live embedded edit and leaves that embedding its own', async () => {
    const spaceThing: ThingDocument = {
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      diagram: SELECTED_DIAGRAM_ID,
      graph: SELECTED_GRAPH_ID,
    };
    const value = home(spaceThing);
    await mount({
      ...value,
      things: value.things.map((thing) =>
        thing.id === HOME_THING_ID ? { ...thing, document: spaceThing } : thing,
      ),
      document: {
        ...value.document,
        diagrams: value.document.diagrams?.map((diagram) => ({
          ...diagram,
          positions: {
            ...diagram.positions,
            [HOME_THING_ID]: { x: 10, y: 20, open: true, openSize: { width: 700, height: 500 } },
          },
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    const editing = containingNode(SPACE_THING_ID);
    const other = containingNode(HOME_THING_ID);
    const otherEmbedded = embeddedNodeOf(HOME_THING_ID, DRAWN_A);
    expect(within(editing).getByRole('button', { name: /Close Thing/ })).toBeTruthy();
    expect(within(other).getByRole('button', { name: /Close Thing/ })).toBeTruthy();
    expect(within(otherEmbedded).getByRole('button', { name: 'Edit Title Intake' })).toBeTruthy();

    fireEvent.click(
      within(embeddedNode(DRAWN_A)).getByRole('button', { name: 'Edit Title Intake' }),
    );
    await waitFor(() =>
      expect(
        within(embeddedNode(DRAWN_A)).getByRole('textbox', { name: 'Thing title' }),
      ).toBeTruthy(),
    );

    // The embedding that owns the caret keeps its editor.
    expect(
      within(embeddedNode(DRAWN_A)).getByRole('textbox', { name: 'Thing title' }),
    ).toBeTruthy();
    // Every containing Thing control goes, on the Space Thing holding the edit
    // and on its sibling alike, and so does the other embedding's own.
    expect(within(editing).queryByRole('button', { name: /Close Thing/ })).toBeNull();
    expect(within(editing).getByTestId('space-thing-diagram').hasAttribute('disabled')).toBe(true);
    expect(within(other).queryByRole('button', { name: /Close Thing/ })).toBeNull();
    expect(within(other).getByTestId('space-thing-diagram').hasAttribute('disabled')).toBe(true);
    expect(within(otherEmbedded).queryByRole('button', { name: 'Edit Title Intake' })).toBeNull();

    fireEvent.keyDown(within(embeddedNode(DRAWN_A)).getByRole('textbox', { name: 'Thing title' }), {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(within(editing).getByRole('button', { name: /Close Thing/ })).toBeTruthy(),
    );
    expect(within(other).getByRole('button', { name: /Close Thing/ })).toBeTruthy();
    expect(within(otherEmbedded).getByRole('button', { name: 'Edit Title Intake' })).toBeTruthy();
  });

  it('reclips the retained drawing when its containing Thing resizes after Exit', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      diagram: SELECTED_DIAGRAM_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
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
        kind: 'resized-thing',
        thingId: SPACE_THING_ID,
        size: { width: 400, height: 400 },
      });
    });
    await waitFor(() => expect(embeddedNode(DRAWN_B).style.clipPath).not.toBe(previous));
    expect(spaces.entry(TARGET_ID)).toBeUndefined();
    expect(within(embeddedNode(DRAWN_B)).queryByRole('button', { name: /Edit Thing/ })).toBeNull();
  });

  /**
   * Delete answers a retained read the way Enter and F2 do.
   *
   * The canvas tells assistive technology that backspace or delete removes the
   * focused Thing from its Diagram, and the read-only drawing left behind by Exit
   * is still focusable. The other two Thing commands aimed at that drawing —
   * `onEditThing` and `onBeginTitleEditing` — reopen the target's session so the
   * next press acts; the deletion command consumed the key and answered
   * nothing, so the press did not remove the Thing, did not reopen the target and
   * left no sentence behind either.
   */
  it('reopens the retained embedding when Delete is aimed at its read-only Thing', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      diagram: SELECTED_DIAGRAM_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
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
    // Thing from the target Diagram nor the containing Space Thing it is drawn in.
    expect(
      spaces
        .entry(TARGET_ID)
        ?.session.getState()
        .working.document.diagrams?.find((diagram) => diagram.id === SELECTED_DIAGRAM_ID)
        ?.positions,
    ).toHaveProperty(DRAWN_B);
    expect(
      initial.session.getState().working.things.some((thing) => thing.id === SPACE_THING_ID),
    ).toBe(true);
  });

  it('protects every containing Space Thing while a nested target owns the editor', async () => {
    const thirdId = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
    const thirdDiagram = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
    const thirdGraph = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
    const thirdThing = uuidSchema.parse('00000000-0000-4000-8000-000000000033');
    const third = spaceSnapshotSchema.parse({
      id: thirdId,
      document: {
        version: 1,
        title: 'Nested target',
        defaultDiagram: thirdDiagram,
        diagrams: [
          {
            id: thirdDiagram,
            title: 'Nested Diagram',
            kind: 'positioned',
            positions: { [thirdThing]: { x: 0, y: 0, open: false } },
            graphs: [{ id: thirdGraph, title: 'Nested Graph', edges: [] }],
          },
        ],
      },
      things: [
        { id: thirdThing, document: { title: 'Nested content', kind: 'markdown', body: '' } },
      ],
    });
    const nestedTarget = spaceSnapshotSchema.parse({
      ...target,
      things: target.things.map((thing) =>
        thing.id === DRAWN_B
          ? {
              ...thing,
              document: {
                title: 'Deeper',
                kind: 'space',
                spaceId: thirdId,
                diagram: thirdDiagram,
                graph: thirdGraph,
              },
            }
          : thing,
      ),
      document: {
        ...target.document,
        diagrams: target.document.diagrams?.map((diagram) =>
          diagram.id !== SELECTED_DIAGRAM_ID
            ? diagram
            : {
                ...diagram,
                positions: {
                  ...diagram.positions,
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
      diagram: SELECTED_DIAGRAM_ID,
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
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    const nested = () => {
      const element = document.querySelector(
        `.react-flow__node[data-id="${embeddedNodeId(embeddedNodeId(SPACE_THING_ID, DRAWN_B), thirdThing)}"]`,
      );
      if (!(element instanceof HTMLElement)) throw new Error('Nested Thing missing');
      return element;
    };
    await waitFor(() =>
      expect(within(nested()).getByRole('button', { name: /Edit Thing/ })).toBeTruthy(),
    );
    fireEvent.click(within(nested()).getByRole('button', { name: /Edit Thing/ }));
    await waitFor(() =>
      expect(within(nested()).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    expect(within(embeddedNode(DRAWN_B)).queryByRole('button', { name: /Close Thing/ })).toBeNull();
    expect(
      within(embeddedNode(DRAWN_B)).getByTestId('space-thing-diagram').hasAttribute('disabled'),
    ).toBe(true);
    const outer = document.querySelector(`.react-flow__node[data-id="${SPACE_THING_ID}"]`);
    if (!(outer instanceof HTMLElement)) throw new Error('Outer Thing missing');
    expect(within(outer).queryByRole('button', { name: /Close Thing/ })).toBeNull();
    fireEvent.click(within(nested()).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(
        within(embeddedNode(DRAWN_B)).getByRole('button', { name: /Close Thing/ }),
      ).toBeTruthy(),
    );
  });

  /**
   * Closing a Space Thing ends its read, and reopening starts a new one.
   *
   * The drawing left behind by an *Exit* is deliberately retained — the target
   * is gone and a read-only picture of it is better than a hole. A Close is the
   * other case: the embedding unmounts with its target still open, so the next
   * Open composes a fresh one, and anything the previous composition published
   * describes a Diagram nobody is reading any more. Held here through the one
   * consequence that outlives the frame: the retained drawing says a nested
   * Space Thing is Open, so reopening embeds a Space the target has since closed.
   */
  it('forgets what a Closed Space Thing read, so reopening embeds nothing it held', async () => {
    const thirdId = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
    const thirdDiagram = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
    const thirdGraph = uuidSchema.parse('00000000-0000-4000-8000-000000000042');
    const thirdThing = uuidSchema.parse('00000000-0000-4000-8000-000000000043');
    const third = spaceSnapshotSchema.parse({
      id: thirdId,
      document: {
        version: 1,
        title: 'Nested target',
        defaultDiagram: thirdDiagram,
        diagrams: [
          {
            id: thirdDiagram,
            title: 'Nested Diagram',
            kind: 'positioned',
            positions: { [thirdThing]: { x: 0, y: 0, open: false } },
            graphs: [{ id: thirdGraph, title: 'Nested Graph', edges: [] }],
          },
        ],
      },
      things: [
        { id: thirdThing, document: { title: 'Nested content', kind: 'markdown', body: '' } },
      ],
    });
    const nestedTarget = spaceSnapshotSchema.parse({
      ...target,
      things: target.things.map((thing) =>
        thing.id === DRAWN_B
          ? {
              ...thing,
              document: {
                title: 'Deeper',
                kind: 'space',
                spaceId: thirdId,
                diagram: thirdDiagram,
                graph: thirdGraph,
              },
            }
          : thing,
      ),
      document: {
        ...target.document,
        diagrams: target.document.diagrams?.map((diagram) =>
          diagram.id !== SELECTED_DIAGRAM_ID
            ? diagram
            : {
                ...diagram,
                positions: {
                  ...diagram.positions,
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
      diagram: SELECTED_DIAGRAM_ID,
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
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() => expect(spaces.entry(thirdId)).not.toBeUndefined());

    // Close the containing Space Thing while the nested one is still Open, so
    // the read it leaves behind describes a Diagram that is about to change.
    act(() => {
      initial.app.authoring.complete({ kind: 'closed-thing', thingId: SPACE_THING_ID });
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).toBeNull());
    const targetEntry = spaces.entry(TARGET_ID);
    if (targetEntry === undefined) throw new Error('the target is not open');
    act(() => {
      targetEntry.app.authoring.completeInDiagram(SELECTED_DIAGRAM_ID, {
        kind: 'closed-thing',
        thingId: DRAWN_B,
      });
    });
    await act(async () => {
      await spaces.exit(thirdId);
    });
    expect(spaces.entry(thirdId)).toBeUndefined();

    act(() => {
      initial.app.authoring.complete({ kind: 'opened-thing', thingId: SPACE_THING_ID });
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    for (let settle = 0; settle < 4; settle += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(spaces.entry(thirdId)).toBeUndefined();
  }, 20000);

  it('stops embedding a Space Thing whose Diagram is already on the containing path', async () => {
    // Home embeds the target, and the target embeds Home back. Neither Thing is
    // a self-reference, so single-Space intake accepts both (`validate.ts` only
    // refuses `thing.spaceId === space.id`); nothing but this guard stops the
    // pair nesting one level deeper on every commit.
    const mutualTarget = spaceSnapshotSchema.parse({
      ...target,
      things: target.things.map((thing) =>
        thing.id === DRAWN_B
          ? {
              ...thing,
              document: {
                title: 'Back to Home',
                kind: 'space',
                spaceId: HOME_ID,
                diagram: HOME_DIAGRAM_ID,
                graph: HOME_GRAPH_ID,
              },
            }
          : thing,
      ),
      document: {
        ...target.document,
        diagrams: target.document.diagrams?.map((diagram) =>
          diagram.id !== SELECTED_DIAGRAM_ID
            ? diagram
            : {
                ...diagram,
                positions: {
                  ...diagram.positions,
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
      diagram: SELECTED_DIAGRAM_ID,
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
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    const query = (id: string): Element | null =>
      document.querySelector(`.react-flow__node[data-id="${id}"]`);
    // Home drawn inside the target, one hop back — that much is ordinary nesting.
    const returned = embeddedNodeId(embeddedNodeId(SPACE_THING_ID, DRAWN_B), SPACE_THING_ID);
    // The second crossing of `TARGET:SELECTED_DIAGRAM` is the cycle. Without the
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

  it('edits the target through the Open Thing without changing the containing Space', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      diagram: SELECTED_DIAGRAM_ID,
      graph: SELECTED_GRAPH_ID,
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [meta, value, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const spaces = createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    await waitFor(() =>
      expect(
        within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Thing/ }),
      ).toBeTruthy(),
    );
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Thing/ }));
    await waitFor(() =>
      expect(
        spaces
          .entry(TARGET_ID)
          ?.session.getState()
          .working.document.diagrams?.find((diagram) => diagram.id === SELECTED_DIAGRAM_ID)
          ?.positions[DRAWN_A]?.open,
      ).toBe(true),
    );
    expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Save/ })).toBeTruthy();
    expect(initial.session.getState().working).toEqual(value);
    expect(spaces.getState().activeSpaceId).toBe(HOME_ID);
  });

  /**
   * The Thing's selection, and not the target's own.
   *
   * `Collection 2` is the target Space's `defaultDiagram` and holds
   * `Elsewhere entirely`; the Thing selects `Collection 1`. Asserting the
   * absence beside the presence is what makes this a statement about *whose*
   * selection was read rather than about whether anything was drawn.
   */
  it('draws the Diagram the Thing selects, not the target own default', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: SELECTED_DIAGRAM_ID,
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
   * The containing Diagram owns the Space Thing's rect and the target Space owns
   * everything inside it, so a child is parented to the Thing and confined to
   * it — which is React Flow's own nesting contract and what makes moving the
   * Space Thing move the view with it.
   */
  it('parents the drawn Things to the Space Thing', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: SELECTED_DIAGRAM_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );

    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    // React Flow renders a child as a sibling of its parent and offsets it by
    // the parent origin, so the parenting is read off the store rather than off
    // the DOM tree. What the DOM does carry is the refusal: no rail, and so no
    // control that could author another Space from this canvas (ADR 0040).
    const drawn = embeddedNode(DRAWN_A);
    expect(within(drawn).getByRole('button', { name: /Open Thing/ })).toBeTruthy();
    // The four sides are anchors here and nothing more. They render because an
    // embedded Diagram draws Edges and an Edge attaches to an anchor (ADR 0087),
    // and the Thing publishes that they are not affordances — which is what
    // keeps the reveal in `styles.css` off them and what leaves no labelled
    // control for a pointer to take hold of.
    expect(drawn.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'false',
    );
    expect(within(drawn).queryByRole('button', { name: /^Connect (from|to) / })).toBeNull();
  });

  /**
   * The one state that draws no view now that the selection is required.
   *
   * A Space Thing selects a Diagram from the moment it exists (ADR 0079), so
   * the Thing that used to stand here — one that had chosen nothing yet — is
   * unreachable, and a pair resolving to nothing means the Diagram it names was
   * deleted out from under it. The Thing has neither failed nor is it waiting:
   * its target read, so both selectors are drawn over the Diagrams that do
   * exist, and the only thing missing is the one it points at.
   */
  it('draws no view for a Thing whose selected Diagram the target no longer holds', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: DELETED_DIAGRAM_ID,
        graph: DELETED_GRAPH_ID,
      }),
    );

    await screen.findByTestId('space-thing-diagram');
    expect(queryEmbeddedNode(DRAWN_A)).toBeNull();
    expect(queryEmbeddedNode(UNPLACED)).toBeNull();
  });

  /**
   * Home over two Spaces the backend does not hold, and one it does.
   *
   * The unreadable pair is what separates a failure *per target* from one
   * sentence for the whole canvas; the third Thing starts Closed so its
   * successful read happens after both refusals, on a press the author makes.
   */
  const unreadable = (): SpaceSnapshot =>
    spaceSnapshotSchema.parse({
      id: HOME_ID,
      document: {
        version: 1,
        title: 'Home',
        diagrams: [
          {
            id: HOME_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: {
              [HOME_THING_ID]: { x: 10, y: 20, open: false },
              [GONE_A_THING_ID]: {
                x: 600,
                y: 20,
                open: true,
                openSize: { width: 700, height: 500 },
              },
              [GONE_B_THING_ID]: {
                x: 1400,
                y: 20,
                open: true,
                openSize: { width: 700, height: 500 },
              },
              [SPACE_THING_ID]: { x: 2200, y: 20, open: false },
            },
            graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
          },
        ],
        defaultDiagram: HOME_DIAGRAM_ID,
      },
      things: [
        { id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
        {
          id: GONE_A_THING_ID,
          document: {
            // Two Title Lines, so the sentence below is read for the name
            // it names the Thing by rather than for the whole Title (ADR 0083).
            title: 'First gone\nA Space that left',
            kind: 'space',
            spaceId: GONE_A_ID,
            diagram: GONE_DIAGRAM_ID,
            graph: GONE_GRAPH_ID,
          },
        },
        {
          id: GONE_B_THING_ID,
          document: {
            title: 'Second gone',
            kind: 'space',
            spaceId: GONE_B_ID,
            diagram: GONE_DIAGRAM_ID,
            graph: GONE_GRAPH_ID,
          },
        },
        {
          id: SPACE_THING_ID,
          document: {
            title: 'Elsewhere',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: SELECTED_DIAGRAM_ID,
            graph: SELECTED_GRAPH_ID,
          },
        },
      ],
    });

  /**
   * A failed read belongs to the embedding that asked for it.
   *
   * One string for the whole canvas made both true at once: only one of two
   * unreadable targets was ever announced, the sentence named neither Thing, and
   * a third Thing opening successfully erased whichever one was on screen.
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
      newId: newUuid,
      history: recordingHistory(),
    });
    const initial = await spaces.open(HOME_ID);
    render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
    const first = await screen.findByText(new RegExp(GONE_A_ID));
    expect(first.textContent).toContain('First gone:');
    // The Thing's name and no more of its Title: this is one sentence, and a
    // line break inside it would draw as a broken-looking label.
    expect(first.textContent).not.toContain('A Space that left');
    expect((await screen.findByText(new RegExp(GONE_B_ID))).textContent).toContain('Second gone');

    act(() => {
      initial.app.authoring.complete({ kind: 'opened-thing', thingId: SPACE_THING_ID });
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
   * Space — so a claim released on failure had an unreadable target read again
   * on essentially every edit anywhere in the session, with no backoff.
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
          kind: 'edited-thing',
          thingId: HOME_THING_ID,
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
