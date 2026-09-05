import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  spaceSnapshotSchema,
  uuidSchema,
  type CardDocument,
  type CardId,
  type SpaceSnapshot,
} from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type SpaceSession,
} from '@project/persistence';
import { embeddedNodeId } from '../src/embedded-layout';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';
import { newUuid } from '@project/core';

/**
 * What an Open Space Card *shows* (ADR 0068).
 *
 * `space-card-selection.test.tsx` holds the two selections the Card authors;
 * this file holds what those selections then draw. The two claims that matter
 * are that the Layout drawn is the **Card's** and never the target Space's own
 * — the target's `defaultLayout` here is deliberately not the one the Card
 * selects — and that target editing, draft ownership and retained reads remain
 * coherent inside the containing canvas as a sub flow.
 *
 * The application half of the evidence ADR 0052 requires; the Ladle half is
 * `stories/surfaces/space-card-embedded-layout.stories.tsx`.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SELECTED_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const SELECTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const DRAWN_A = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const DRAWN_B = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const UNPLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

/**
 * The target: two Layouts over three Cards, and the one the Card selects is
 * **not** the Space's own `defaultLayout`.
 *
 * That asymmetry is the fixture's whole job. With one Layout, or with the
 * selected one also being the default, a Card reading the target's own
 * selection would draw exactly what a Card reading its own does.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    layouts: [
      {
        id: SELECTED_LAYOUT_ID,
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
        id: OTHER_LAYOUT_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [UNPLACED]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultLayout: OTHER_LAYOUT_ID,
  },
  cards: [
    { id: DRAWN_A, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: DRAWN_B, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: UNPLACED, document: { title: 'Elsewhere entirely', kind: 'markdown', body: '' } },
  ],
});

/** Home, holding one Space Card the Layout has already Opened (ADR 0064). */
const home = (spaceCard: Extract<CardDocument, { kind: 'space' }>): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: HOME_ID,
    document: {
      version: 1,
      title: 'Home',
      layouts: [
        {
          id: HOME_LAYOUT_ID,
          title: 'Layout 1',
          kind: 'positioned',
          positions: {
            [HOME_CARD_ID]: { x: 10, y: 20, open: false },
            [SPACE_CARD_ID]: {
              x: 600,
              y: 20,
              open: true,
              openSize: { width: 700, height: 500 },
            },
          },
          graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultLayout: HOME_LAYOUT_ID,
    },
    cards: [
      { id: HOME_CARD_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
      { id: SPACE_CARD_ID, document: spaceCard },
    ],
  });

const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    layouts: [
      {
        id: META_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [META_CARD_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultLayout: META_LAYOUT_ID,
  },
  cards: [
    { id: META_CARD_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    { id: META_TO_HOME_ID, document: { title: 'Home', kind: 'space', spaceId: HOME_ID } },
    {
      id: META_TO_TARGET_ID,
      document: { title: 'Architecture', kind: 'space', spaceId: TARGET_ID },
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

const queryEmbeddedNode = (cardId: CardId): HTMLElement | null => {
  const node = document.querySelector(
    `.react-flow__node[data-id="${embeddedNodeId(SPACE_CARD_ID, cardId)}"]`,
  );
  return node instanceof HTMLElement ? node : null;
};

/** The same query where its absence is a broken test rather than a claim. */
const embeddedNode = (cardId: CardId): HTMLElement => {
  const node = queryEmbeddedNode(cardId);
  if (node === null) throw new Error(`no embedded node is drawn for ${cardId}`);
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

describe('the Layout an Open Space Card draws', () => {
  it.each(['failed', 'conflicted'] as const)(
    'reports embedded %s persistence on its target entry and exposes recovery only there',
    async (kind) => {
      const value = home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        layout: SELECTED_LAYOUT_ID,
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
      fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Open Card/ }));
      await waitFor(() =>
        expect(spaces.entry(TARGET_ID)?.session.getState().persistence.kind).toBe(kind),
      );
      const targetEntry = screen.getByRole('tab', { name: /Architecture/ });
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
      layout: SELECTED_LAYOUT_ID,
      graph: SELECTED_GRAPH_ID,
    });
    await mount({
      ...value,
      document: {
        ...value.document,
        layouts: value.document.layouts?.map((layout) => ({
          ...layout,
          graphs: layout.graphs.map((graph) => ({
            ...graph,
            edges: [{ from: HOME_CARD_ID, to: SPACE_CARD_ID }],
          })),
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Present' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Card/ }));
    await waitFor(() =>
      expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    const parent = document.querySelector(`.react-flow__node[data-id="${SPACE_CARD_ID}"]`);
    if (!(parent instanceof HTMLElement)) throw new Error('Space Card missing');
    expect(within(parent).queryByRole('button', { name: /Close Card/ })).toBeNull();
    expect(within(parent).getByTestId('space-card-layout').hasAttribute('disabled')).toBe(true);
    const sibling = document.querySelector(`.react-flow__node[data-id="${HOME_CARD_ID}"]`);
    if (!(sibling instanceof HTMLElement)) throw new Error('Containing Markdown Card missing');
    expect(within(sibling).queryByRole('button', { name: /Edit Card/ })).toBeNull();
    expect(within(embeddedNode(DRAWN_B)).queryByRole('button', { name: /Edit Card/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Present' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(within(parent).getByRole('button', { name: /Close Card/ })).toBeTruthy(),
    );
  });

  it('allows only one content editor across two embeddings of the same target', async () => {
    const document: CardDocument = {
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      layout: SELECTED_LAYOUT_ID,
      graph: SELECTED_GRAPH_ID,
    };
    const value = home(document);
    await mount({
      ...value,
      cards: value.cards.map((card) => (card.id === HOME_CARD_ID ? { ...card, document } : card)),
      document: {
        ...value.document,
        layouts: value.document.layouts?.map((layout) => ({
          ...layout,
          positions: {
            ...layout.positions,
            [HOME_CARD_ID]: { x: 10, y: 20, open: true, openSize: { width: 700, height: 500 } },
          },
        })),
      },
    });
    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Card/ }));
    await waitFor(() =>
      expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    const duplicate = window.document.querySelector(
      `.react-flow__node[data-id="${embeddedNodeId(HOME_CARD_ID, DRAWN_A)}"]`,
    );
    if (!(duplicate instanceof HTMLElement)) throw new Error('Duplicate embedded Card missing');
    expect(within(duplicate).queryByRole('button', { name: /Edit Card/ })).toBeNull();
    expect(within(duplicate).queryByRole('button', { name: /Save/ })).toBeNull();
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(within(duplicate).getByRole('button', { name: /Edit Card/ })).toBeTruthy(),
    );
  });

  it('reclips the retained drawing when its containing Card resizes after Exit', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      layout: SELECTED_LAYOUT_ID,
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
      await spaces.close(TARGET_ID);
    });
    act(() => {
      initial.app.authoring.complete({
        kind: 'resized-card',
        cardId: SPACE_CARD_ID,
        size: { width: 400, height: 400 },
      });
    });
    await waitFor(() => expect(embeddedNode(DRAWN_B).style.clipPath).not.toBe(previous));
    expect(spaces.entry(TARGET_ID)).toBeUndefined();
    expect(within(embeddedNode(DRAWN_B)).queryByRole('button', { name: /Edit Card/ })).toBeNull();
  });

  it('protects every containing Space Card while a nested target owns the editor', async () => {
    const thirdId = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
    const thirdLayout = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
    const thirdGraph = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
    const thirdCard = uuidSchema.parse('00000000-0000-4000-8000-000000000033');
    const third = spaceSnapshotSchema.parse({
      id: thirdId,
      document: {
        version: 1,
        title: 'Nested target',
        defaultLayout: thirdLayout,
        layouts: [
          {
            id: thirdLayout,
            title: 'Nested Layout',
            kind: 'positioned',
            positions: { [thirdCard]: { x: 0, y: 0, open: false } },
            graphs: [{ id: thirdGraph, title: 'Nested Graph', edges: [] }],
          },
        ],
      },
      cards: [{ id: thirdCard, document: { title: 'Nested content', kind: 'markdown', body: '' } }],
    });
    const nestedTarget = spaceSnapshotSchema.parse({
      ...target,
      cards: target.cards.map((card) =>
        card.id === DRAWN_B
          ? {
              ...card,
              document: {
                title: 'Deeper',
                kind: 'space',
                spaceId: thirdId,
                layout: thirdLayout,
                graph: thirdGraph,
              },
            }
          : card,
      ),
      document: {
        ...target.document,
        layouts: target.document.layouts?.map((layout) =>
          layout.id !== SELECTED_LAYOUT_ID
            ? layout
            : {
                ...layout,
                positions: {
                  ...layout.positions,
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
      layout: SELECTED_LAYOUT_ID,
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
        `.react-flow__node[data-id="${embeddedNodeId(embeddedNodeId(SPACE_CARD_ID, DRAWN_B), thirdCard)}"]`,
      );
      if (!(element instanceof HTMLElement)) throw new Error('Nested Card missing');
      return element;
    };
    await waitFor(() =>
      expect(within(nested()).getByRole('button', { name: /Edit Card/ })).toBeTruthy(),
    );
    fireEvent.click(within(nested()).getByRole('button', { name: /Edit Card/ }));
    await waitFor(() =>
      expect(within(nested()).getByRole('button', { name: /Save/ })).toBeTruthy(),
    );
    expect(within(embeddedNode(DRAWN_B)).queryByRole('button', { name: /Close Card/ })).toBeNull();
    expect(
      within(embeddedNode(DRAWN_B)).getByTestId('space-card-layout').hasAttribute('disabled'),
    ).toBe(true);
    const outer = document.querySelector(`.react-flow__node[data-id="${SPACE_CARD_ID}"]`);
    if (!(outer instanceof HTMLElement)) throw new Error('Outer Card missing');
    expect(within(outer).queryByRole('button', { name: /Close Card/ })).toBeNull();
    fireEvent.click(within(nested()).getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(
        within(embeddedNode(DRAWN_B)).getByRole('button', { name: /Close Card/ }),
      ).toBeTruthy(),
    );
  });

  it('edits the target through the Open Card without changing the containing Space', async () => {
    const value = home({
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET_ID,
      layout: SELECTED_LAYOUT_ID,
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
      expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Card/ })).toBeTruthy(),
    );
    fireEvent.click(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Edit Card/ }));
    await waitFor(() =>
      expect(
        spaces
          .entry(TARGET_ID)
          ?.session.getState()
          .working.document.layouts?.find((layout) => layout.id === SELECTED_LAYOUT_ID)?.positions[
          DRAWN_A
        ]?.open,
      ).toBe(true),
    );
    expect(within(embeddedNode(DRAWN_A)).getByRole('button', { name: /Save/ })).toBeTruthy();
    expect(initial.session.getState().working).toEqual(value);
    expect(spaces.getState().activeSpaceId).toBe(HOME_ID);
  });

  /**
   * The Card's selection, and not the target's own.
   *
   * `Collection 2` is the target Space's `defaultLayout` and holds
   * `Elsewhere entirely`; the Card selects `Collection 1`. Asserting the
   * absence beside the presence is what makes this a statement about *whose*
   * selection was read rather than about whether anything was drawn.
   */
  it('draws the Layout the Card selects, not the target own default', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        layout: SELECTED_LAYOUT_ID,
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
   * The containing Layout owns the Space Card's rect and the target Space owns
   * everything inside it, so a child is parented to the Card and confined to
   * it — which is React Flow's own nesting contract and what makes moving the
   * Space Card move the view with it.
   */
  it('parents the drawn Cards to the Space Card', async () => {
    await mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        layout: SELECTED_LAYOUT_ID,
        graph: SELECTED_GRAPH_ID,
      }),
    );

    await waitFor(() => expect(queryEmbeddedNode(DRAWN_A)).not.toBeNull());
    // React Flow renders a child as a sibling of its parent and offsets it by
    // the parent origin, so the parenting is read off the store rather than off
    // the DOM tree. What the DOM does carry is the refusal: no rail, and so no
    // control that could author another Space from this canvas (ADR 0040).
    const drawn = embeddedNode(DRAWN_A);
    expect(drawn.querySelector('.rf-card-node__authoring-handle')).toBeNull();
    expect(within(drawn).getByRole('button', { name: /Open Card/ })).toBeTruthy();
  });

  /**
   * A Space Card that has selected nothing yet is the state creation leaves it
   * in until `layout-only-v1/04` stores one. It draws its selectors and no
   * view — which is a Card waiting, not a Card that failed.
   */
  it('draws no view for a Card that has selected no Layout', async () => {
    await mount(home({ title: 'Elsewhere', kind: 'space', spaceId: TARGET_ID }));

    await screen.findByTestId('space-card-layout');
    expect(queryEmbeddedNode(DRAWN_A)).toBeNull();
    expect(queryEmbeddedNode(UNPLACED)).toBeNull();
  });
});
