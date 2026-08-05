import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession, type SpaceSession } from '@project/persistence';
import { mountWorkspace } from '../src/Workspace';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SECOND_ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');

/**
 * Two Cards on one Route in an authored Layout, so the graph opens on a
 * Positioned renderer with a placement already installed and presenting has a
 * walk to run.
 */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Workspace',
    routes: [{ id: ROUTE_ID, title: 'Route', edges: [{ from: CARD_ID, to: OTHER_CARD_ID }] }],
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD_ID]: { x: 10, y: 20 }, [OTHER_CARD_ID]: { x: 300, y: 20 } },
      },
    ],
    defaultView: LAYOUT_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_CARD_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

/**
 * The same content drawn three times: Card A and two Aliases of it, each placed
 * and titled in its own right.
 *
 * One Alias can only show that its target changed, which is the weaker half of
 * a single source of truth. Two is where an edit made through one occurrence
 * has somewhere else to be wrong — and where the editor's composite key stops
 * being redundant, since both Aliases resolve to the same content id.
 */
const twiceAliased: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    layouts: [
      {
        ...snapshot.document.layouts![0],
        positions: {
          ...snapshot.document.layouts![0]!.positions,
          [ALIAS_ID]: { x: 600, y: 20 },
          [SECOND_ALIAS_ID]: { x: 900, y: 20 },
        },
      },
    ],
  },
  cards: [
    ...snapshot.cards,
    { id: ALIAS_ID, document: { title: 'A again', kind: 'alias', target: CARD_ID } },
    { id: SECOND_ALIAS_ID, document: { title: 'A once more', kind: 'alias', target: CARD_ID } },
  ],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(value: SpaceSnapshot = snapshot): SpaceSession {
  const stored = { snapshot: value, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([stored]), stored);
  let view: RenderResult | undefined;
  mountWorkspace({ space: runtime(value), spaceSession: session }, (app) => {
    if (view === undefined) view = render(app);
    else view.rerender(app);
  });
  return session;
}

const cardTitleOf = (session: SpaceSession, cardId: string): string | undefined =>
  session.getState().working.cards.find((card) => card.id === cardId)?.document.title;

const bodyOf = (session: SpaceSession, cardId: string): string | undefined => {
  const document = session.getState().working.cards.find((card) => card.id === cardId)?.document;
  return document?.kind === 'markdown' ? document.body : undefined;
};

/**
 * Persistence is asynchronous and the strategy that places Cards is too, so a
 * test that ends the moment it has asserted leaves both to land against an
 * unmounted tree. Waiting for the session to settle is the app's own signal that
 * everything a completed Edit started has finished.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

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

describe('authoring a Card title on the graph', () => {
  /**
   * `z.string().min(1)` counts characters, and a space is one — so the schema
   * alone accepts a title that draws as nothing, leaving a Card that cannot be
   * told apart from its neighbours and an `Edit title of` label naming nobody.
   * Blank is the empty case wearing different bytes.
   */
  it('refuses a blank title and leaves the stored Card alone', async () => {
    const session = mount();
    fireEvent.doubleClick(await screen.findByRole('heading', { name: 'A' }));
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(cardTitleOf(session, CARD_ID)).toBe('A');
    await settled(session);
  });

  it('stores a title without the whitespace surrounding it', async () => {
    const session = mount();
    fireEvent.doubleClick(await screen.findByRole('heading', { name: 'A' }));
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: '  Renamed A  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(cardTitleOf(session, CARD_ID)).toBe('Renamed A');
    await settled(session);
  });
});

/** Open Card A, which is to say edit it (ADR 0037). */
async function openEditor(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A' }));
}

describe('authoring an opened Card', () => {
  it('updates the content owner through an Alias and preserves the authored Alias', async () => {
    const aliased = spaceSnapshotSchema.parse({
      ...snapshot,
      document: {
        ...snapshot.document,
        layouts: [
          {
            ...snapshot.document.layouts![0],
            positions: {
              ...snapshot.document.layouts![0]!.positions,
              [ALIAS_ID]: { x: 600, y: 20 },
            },
          },
        ],
      },
      cards: [
        ...snapshot.cards,
        {
          id: ALIAS_ID,
          document: {
            title: 'A again',
            description: 'Alias caption stays authored here',
            kind: 'alias',
            target: CARD_ID,
          },
        },
      ],
    });
    const session = mount(aliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A again' }));
    expect(screen.getByText('Opened through A again')).toBeVisible();
    expect(screen.getByText('Editing content on A')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    // Qualified, because the Alias draws a description of its own on the graph
    // behind this pane and these fields do not author it.
    expect(screen.getByRole('textbox', { name: 'Description of A' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description of A' }), {
      target: { value: 'Shared target caption' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'Shared target source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(session.getState().working.cards).toContainEqual({
      id: CARD_ID,
      document: {
        title: 'A',
        description: 'Shared target caption',
        kind: 'markdown',
        body: 'Shared target source',
      },
    });
    expect(session.getState().working.cards).toContainEqual(aliased.cards[2]);
    await settled(session);
  });

  /**
   * "Every place showing that content changes together" is the promise, and one
   * Alias cannot test it: reading the edit back through the target only says the
   * target was written. A second Alias is a second occurrence that has to have
   * moved with it, and it never touched the edit itself.
   */
  it('shows an edit made through one Alias when a second Alias of the same Card opens', async () => {
    const session = mount(twiceAliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A again' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'Written once, shown everywhere' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description of A' }), {
      target: { value: 'One caption, three occurrences' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A once more' }));
    expect(screen.getByText('Opened through A once more')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveValue(
      'Written once, shown everywhere',
    );
    expect(screen.getByRole('textbox', { name: 'Description of A' })).toHaveValue(
      'One caption, three occurrences',
    );
    // Neither Alias was written, only the Card they both show.
    expect(session.getState().working.cards).toContainEqual(twiceAliased.cards[2]);
    expect(session.getState().working.cards).toContainEqual(twiceAliased.cards[3]);
    await settled(session);
  });

  /**
   * Both Aliases resolve to one content Card, so the identity the editor's draft
   * hangs on is shared and only the occurrence differs. Nothing typed into the
   * first and abandoned may appear in the second.
   */
  it('opens a second Alias on the stored content, not the draft abandoned in the first', async () => {
    const session = mount(twiceAliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A again' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'Never completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A once more' }));

    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveValue('A source');
    expect(bodyOf(session, CARD_ID)).toBe('A source');
    await settled(session);
  });

  /**
   * Escape cancels, and the pane closes with it — there is no reading state
   * behind the editor to fall back to (ADR 0037). What matters is that the draft
   * is discarded rather than committed, and that the window listener does not
   * also fire.
   */
  it('cancels the edit on Escape without committing the draft', async () => {
    const session = mount();
    await openEditor();
    const source = screen.getByRole('textbox', { name: 'Markdown source' });
    fireEvent.change(source, { target: { value: 'Draft nobody asked to lose' } });

    fireEvent.keyDown(source, { key: 'Escape' });

    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(snapshot);
    await settled(session);
  });

  /**
   * Presenting is read-only, and the reason no Edit action survives into it is
   * that no opened Card does: starting the walk closes whatever was open, and
   * the graph refuses to open a Card while presenting. `OpenCard` is handed its
   * Edit action without being told the mode, so this is the guarantee that keeps
   * that honest, and it is a long way from the component relying on it.
   */
  it('leaves no opened Card, and so no Edit action, once presenting starts', async () => {
    const session = mount();
    await openEditor();
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();

    fireEvent.click(screen.getByTestId('present-button'));

    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
    await settled(session);
  });

  it('authors the title from the pane, as the graph does inline', async () => {
    const session = mount();
    await openEditor();

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Renamed from the pane' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(cardTitleOf(session, CARD_ID)).toBe('Renamed from the pane');
    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * The pane keeps its draft in `useState`, seeded once from the Card it was
   * mounted on. Opening a second Card without closing the first therefore had
   * the same React element in the same position — so the state survived while
   * `card.id` changed underneath it, and the fields were now A's text wearing
   * B's identity. `Done` then wrote A's title and body over B.
   *
   * Reachable from the keyboard: the pane traps nothing, so `Enter` on a node
   * behind it opens that Card (`GraphView`'s handler only declines while
   * presenting).
   */
  it('never carries one Card’s draft onto another', async () => {
    const session = mount();
    await openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'A rewritten' },
    });

    const other = (await screen.findByRole('heading', { name: 'B' })).closest('.react-flow__node');
    if (other === null) throw new Error('Card B is not drawn as a node');
    fireEvent.keyDown(other, { key: 'Enter' });

    // Whatever the pane shows, it must not be A's draft under B's id.
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('A rewritten');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(cardTitleOf(session, OTHER_CARD_ID)).toBe('B');
    expect(bodyOf(session, OTHER_CARD_ID)).toBe('B source');
    await settled(session);
  });

  /**
   * Two handlers answer Escape — the form's own cancel, and the window listener
   * `App` registers while a Card is open — and which one runs depends on where
   * the key lands. Outside the fields only the listener does. Both close without
   * committing, so the pane behaves the same either way; this is what says so,
   * since the form's `stopPropagation` makes it easy to assume otherwise.
   */
  it('closes without committing when Escape is pressed outside the fields', async () => {
    const session = mount();
    await openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'A rewritten' },
    });

    const panel = screen.getByTestId('open-card');
    fireEvent.click(panel);
    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    expect(bodyOf(session, CARD_ID)).toBe('A source');
    await settled(session);
  });
});

describe('the Card affordance on the graph', () => {
  it('opens the Card on its editable fields, with no reading state in front', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A' }));

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('A source');
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * No gesture on a Card's body opens it (ADR 0036) — the title centres in a
   * Card, so a body gesture and the rename would want the same pixels.
   */
  it('is the only pointer route in — the Card body opens nothing', async () => {
    const session = mount();
    const card = (await screen.findByRole('heading', { name: 'A' })).closest('.react-flow__node');
    if (card === null) throw new Error('Card A is not drawn as a node');

    fireEvent.click(card);
    fireEvent.doubleClick(card);

    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    await settled(session);
  });
});
