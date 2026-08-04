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

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(): SpaceSession {
  const stored = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([stored]), stored);
  let view: RenderResult | undefined;
  mountWorkspace({ space: runtime(snapshot), spaceSession: session }, (app) => {
    if (view === undefined) view = render(app);
    else view.rerender(app);
  });
  return session;
}

const cardTitleOf = (session: SpaceSession, cardId: string): string | undefined =>
  session.getState().working.cards.find((card) => card.id === cardId)?.document.title;

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
    expect(screen.queryByRole('button', { name: 'Edit Card' })).not.toBeInTheDocument();
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
});

describe('the Card affordance on the graph', () => {
  it('opens the Card on its editable fields, with no reading state in front', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A' }));

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('A source');
    expect(screen.queryByRole('button', { name: 'Edit Card' })).not.toBeInTheDocument();
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
