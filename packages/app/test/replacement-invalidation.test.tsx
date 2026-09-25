import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPEN_SIZE,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
import { beginRename } from './command-dock';
import { selectResource } from './resource-selection';

/**
 * ADR 0042's "one shared contract test": an Interaction draft open when a stored
 * Space is accepted is discarded with the Space it named.
 *
 * Three surfaces own a draft the author can reach — the graph's inline title
 * field, the opened-Resource pane, and React Flow's drag — and no one mechanism
 * discards all three. The Dock's chrome rename is a fourth, outside the canvas:
 * `IdentityName` ends a rename on the replacement epoch, and the case stages a
 * draft the rename refuses so the assertion does not turn on where jsdom put
 * focus.
 *
 * **What the modal does to a draft is the hazard this file stages around.**
 * The only trigger the app has for accepting a stored Space is the conflict
 * banner's `Accept remote`, which lives in a modal `AlertDialog`. Raising the
 * conflict traps focus into that dialog, the field blurs, and blur is
 * `InlineTitleEditor`'s own commit — so a draft the rename would *accept* is
 * committed before the replacement lands and there is nothing left to discard.
 * That is the app's real behaviour through its real trigger, not a harness
 * artifact, and whether an arriving conflict should commit an in-progress
 * rename is a product question this file does not freeze. A draft the rename
 * **refuses** is held open and editable by contract, which is why the chrome
 * case below stages one: it is the draft that survives the trap
 * either way, so what the assertion reads is the replacement and nothing else.
 *
 * What is deliberately **not** asserted: that the discard is silent, and where
 * focus lands afterwards. Both are open product questions, and a test that
 * pinned either would freeze an answer nobody has given.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

/**
 * One positioned Resource in a Map that owns one empty Graph — the smallest Space
 * that draws a Resource, and one Resource has nothing to connect (ADR 0040).
 *
 * The local and remote snapshots below share every identity and differ only in
 * their values. That is the point: a draft naming a Resource the replacement no
 * longer holds would be discarded by the lookup failing, which proves nothing.
 * Here the Resource the author was editing still exists, still under the same id,
 * and the draft must go anyway.
 */
const snapshot = (
  title: string,
  mapTitle: string,
  resourceTitle: string,
  body: string,
  x: number,
  y: number,
  { open = false }: { readonly open?: boolean } = {},
): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title,
      maps: [
        {
          id: MAP_ID,
          title: mapTitle,
          kind: 'positioned',
          positions: {
            [RESOURCE_ID]: open
              ? { x, y, open: true, openSize: DEFAULT_OPEN_SIZE }
              : { x, y, open: false },
          },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultMap: MAP_ID,
    },
    resources: [{ id: RESOURCE_ID, document: { title: resourceTitle, kind: 'markdown', body } }],
  });

const LOCAL = snapshot('Local space', 'Local map', 'Local resource', 'Local source', 10, 20);
const LOCAL_OPEN = snapshot('Local space', 'Local map', 'Local resource', 'Local source', 10, 20, {
  open: true,
});
const REMOTE = snapshot('Remote space', 'Remote map', 'Remote resource', 'Remote source', 900, 700);
const MARKDOWN_SOURCE = 'Markdown source of Local resource';
const MARKDOWN_EDIT = 'Edit Markdown source of Local resource';
const MARKDOWN_DRAFT = 'Unsaved prose that Reload must discard';

/** Paste into the Markdown source textbox the editor exposes. */
const replaceMarkdownSource = (value: string): HTMLElement => {
  const source = screen.getByRole('textbox', { name: MARKDOWN_SOURCE });
  source.focus();
  fireEvent.keyDown(source, { key: 'a', ctrlKey: true });
  fireEvent.paste(source, { clipboardData: { getData: () => value } });
  return source;
};

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

/**
 * A mounted Space app over a session whose stored Space has already moved to
 * `REMOTE`, but which has not yet discovered that.
 *
 * The conflict is raised *after* the draft is open rather than before, and the
 * order is load-bearing: a conflicted session draws its `Accept remote` in a
 * modal AlertDialog that marks the rest of the shell inert, so a Space app
 * mounted already-conflicted has no reachable Resource to open a draft on.
 */
async function mountedSpaceApp(local: SpaceSnapshot = LOCAL): Promise<SpaceSession> {
  const backend = MemorySpaceBackend.asMeta({
    snapshot: REMOTE,
    revision: 4n,
    exportedRevision: null,
  });
  const { spaceSession: session, spaceResources } = openTestSpace(backend, {
    snapshot: local,
    revision: 3n,
    exportedRevision: null,
  });

  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(local).id,
      session,
      app: composeApp({ spaceSession: session, spaceResources }),
      spaceResources,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  // Placement is asynchronous, so the Resource arrives after the mount rather than
  // with it. Every draft below starts from a drawn Resource.
  await screen.findByRole('heading', { name: 'Local resource' });
  return session;
}

/**
 * Discover the conflict with the draft already open: a commit against the
 * revision this session acknowledged, which the backend has moved past.
 */
const raiseConflict = async (session: SpaceSession): Promise<void> => {
  // The submission publishes synchronously, so it is owned by its own `act`;
  // the reply that conflicts is awaited outside it.
  act(() => {
    session.submit(session.getState().working);
  });
  await waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));
  await screen.findByTestId('persistence-accept-remote');
};

const acceptRemote = (): void => {
  fireEvent.click(screen.getByTestId('persistence-accept-remote'));
};

const keepLocal = (): void => {
  fireEvent.click(screen.getByTestId('persistence-keep-local'));
};

/**
 * Open-at-rest: the Resource starts Open, so once it is selected Edit Markdown
 * source is on screen without an Open Edit (ADR 0102). Persistence stays settled
 * until the conflict is raised afterwards with the draft already live.
 */
async function stageOpenMarkdownDraft(session: SpaceSession): Promise<void> {
  expect(session.getState().persistence.kind).toBe('settled');
  await selectResource('Local resource');
  fireEvent.click(await screen.findByRole('button', { name: MARKDOWN_EDIT }));
  await screen.findByRole('textbox', { name: MARKDOWN_SOURCE }, { timeout: 5000 });
  const source = replaceMarkdownSource(MARKDOWN_DRAFT);
  expect(source).toHaveTextContent(MARKDOWN_DRAFT);
  expect(session.getState().persistence.kind).toBe('settled');
  await raiseConflict(session);
  expect(screen.getByRole('textbox', { name: MARKDOWN_SOURCE, hidden: true })).toHaveTextContent(
    MARKDOWN_DRAFT,
  );
}

/**
 * The accepted Space is the one on screen — read off the shell's title, which is
 * the Space's own name and the one entity the replacement renames that no
 * draft, Resource or placement is involved in.
 *
 * Waited for *before* each draft assertion so that a surviving draft fails on the
 * assertion naming it, rather than on some later expectation that could not find
 * the Resource the open editor was covering.
 */
const replacementLanded = async (): Promise<void> => {
  expect(await within(screen.getByTestId('command-dock')).findByText('Remote space')).toBeVisible();
};

const nodeOf = (id: string): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  if (node === null) throw new Error(`No node is drawn for ${id}.`);
  return node;
};

/**
 * Begin a real React Flow node drag and leave it in flight — pointer down, two
 * moves, no release.
 *
 * React Flow drags through d3-drag, which reads `event.view` to bind its own
 * move listeners. Testing Library builds a `MouseEvent` whose `view` is null and
 * jsdom refuses one passed through `MouseEventInit`, so the property is defined
 * on the constructed event instead. Without it d3 throws inside the listener,
 * which jsdom reports as an uncaught exception rather than a failing assertion —
 * the test then passes and the run exits 1.
 */
const withView = <E extends Event>(event: E, view: Window): E => {
  Object.defineProperty(event, 'view', { value: view, configurable: true });
  return event;
};

function beginDrag(node: HTMLElement): void {
  const view = node.ownerDocument.defaultView;
  if (view === null) throw new Error('The drag needs a window to bind its move listeners to.');
  fireEvent(
    node,
    withView(createEvent.mouseDown(node, { clientX: 0, clientY: 0, buttons: 1 }), view),
  );
  fireEvent(
    view,
    withView(createEvent.mouseMove(view, { clientX: 120, clientY: 60, buttons: 1 }), view),
  );
  fireEvent(
    view,
    withView(createEvent.mouseMove(view, { clientX: 240, clientY: 120, buttons: 1 }), view),
  );
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

/**
 * Release any gesture a test left in flight.
 *
 * d3-drag binds `mousemove.drag`/`mouseup.drag` to the **window** and removes
 * them only from its own `mouseupped`, and XYDrag's autopan
 * `requestAnimationFrame` loop is cancelled only by that same release. So a test
 * that ends mid-drag — which the drag case below does deliberately — leaves both
 * running for the rest of the file.
 *
 * Neither can reach another test file: vitest isolates one jsdom per file. And
 * the next gesture's `mousedown` rebinds the same d3 names over the stale ones,
 * so a later test in this file would not inherit them either. This is here so
 * that a third test added below inherits a quiet window rather than that
 * argument, and it asserts nothing — the drag case makes its own claims before
 * this runs.
 */
afterEach(() => {
  fireEvent(window, withView(createEvent.mouseUp(window, { clientX: 240, clientY: 120 }), window));
});

describe('accepting a stored Space discards the open Interaction draft', () => {
  /**
   * The inline Title draft lives inside the Canvas Resource. Replacement remounts
   * the keyed canvas subtree, so neither its caret nor its uncompleted value can
   * cross into the new Space. An open Markdown draft cannot be staged against
   * this fixture's closed Resource: opening is itself an authored commit and
   * therefore raises the fixture's deliberately waiting conflict before body
   * editing can begin. The Open-at-rest mount below stages that draft without
   * an Open Edit.
   */
  it('discards a Resource title editor holding an uncompleted draft', async () => {
    const session = await mountedSpaceApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title Local resource' }));
    const title = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(title, {
      target: { value: 'Title nobody pressed Enter on' },
    });
    expect(title).toHaveValue('Title nobody pressed Enter on');

    await raiseConflict(session);
    acceptRemote();

    await replacementLanded();
    expect(screen.queryByRole('textbox', { name: 'Resource title' })).not.toBeInTheDocument();
    expect(screen.queryByText('Title nobody pressed Enter on')).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(REMOTE);
    expect(await screen.findByRole('heading', { name: 'Remote resource' })).toBeVisible();
  });

  /**
   * A Markdown body draft is component-local state (ADR 0064: no commit on blur),
   * so the conflict dialog can come up while the editor is still mounted. Reload
   * remounts the canvas and the accepted Space wins; Keep local and retry is
   * the contrast that leaves the typed prose in place.
   */
  it('discards an unsaved Markdown draft when the stored Space is accepted', async () => {
    const session = await mountedSpaceApp(LOCAL_OPEN);
    await stageOpenMarkdownDraft(session);
    acceptRemote();

    await replacementLanded();
    expect(
      screen.queryByRole('textbox', { name: MARKDOWN_SOURCE, hidden: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(MARKDOWN_DRAFT)).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(REMOTE);
    expect(await screen.findByRole('heading', { name: 'Remote resource' })).toBeVisible();
  });

  it('keeps an unsaved Markdown draft when Keep local and retry is chosen', async () => {
    const session = await mountedSpaceApp(LOCAL_OPEN);
    await stageOpenMarkdownDraft(session);
    keepLocal();

    expect(screen.getByRole('textbox', { name: MARKDOWN_SOURCE, hidden: true })).toHaveTextContent(
      MARKDOWN_DRAFT,
    );
    expect(session.getState().working).toEqual(LOCAL_OPEN);
    // The retry saves the local Space, and the draft outlives that too.
    await waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));
    expect(screen.getByRole('textbox', { name: MARKDOWN_SOURCE, hidden: true })).toHaveTextContent(
      MARKDOWN_DRAFT,
    );
  });

  /**
   * The Space chrome's own title draft, which lives outside the keyed canvas
   * subtree and so is reached by none of the mechanisms above. A Map rename
   * left uncompleted names a Map the accepted Space may not hold, and
   * completing it afterwards writes against whatever Map now resolves.
   *
   * **The draft is one the rename refuses, and that is what makes this test say
   * anything.** With a typed name the assertion would turn on where the
   * conflict's modal put the caret: `AlertDialog` traps focus, the field blurs,
   * and blur is `InlineTitleEditor`'s own commit — so whenever the trap reached
   * the field the draft would be *committed* before the accept and the
   * replacement would have nothing left to discard. A blank name is the one
   * refusal every renameable entity has (`IdentityName`), and a refused draft is
   * held open and editable by contract — so the editor is still standing when
   * the accept lands whether the trap reached it or not, and the assertion is
   * about the replacement rather than about jsdom's focus.
   *
   * `hidden: true` throughout for the same reason: a conflicted shell is
   * `aria-hidden` behind the modal, so an accessibility-tree query answers
   * "gone" for an editor that is still mounted, and the discard would read as
   * proved by the dialog that hid it.
   */
  it('discards a Map rename left open when the stored Space is accepted', async () => {
    const session = await mountedSpaceApp();
    await beginRename('selected-canvas');
    const name = screen.getByRole('textbox', { name: 'Map name' });
    fireEvent.change(name, { target: { value: '   ' } });
    expect(name).toHaveValue('   ');

    await raiseConflict(session);
    // The staged pre-condition, asserted rather than assumed: without an open
    // editor here the discard below is vacuous.
    expect(screen.getByRole('textbox', { name: 'Map name', hidden: true })).toHaveValue('   ');
    acceptRemote();

    await replacementLanded();
    expect(
      screen.queryByRole('textbox', { name: 'Map name', hidden: true }),
    ).not.toBeInTheDocument();
    // And the cluster is back to naming the Map the accepted Space authored,
    // rather than an editor reseeded from it.
    expect(await screen.findByTestId('selected-canvas')).toHaveTextContent('Remote map');
  });

  /**
   * The Space's own name, a draft this rule has to reach — and which reaches it for a *different* reason than the Map above.
   *
   * The Dock's one rename slot ends a draft on two facts: the replacement epoch,
   * and the subject the rename was begun against changing under it
   * (`useDockRenaming`). The Map case is ambiguous between them only by
   * accident — the accepted Space carries the same Map id, so the subject is
   * unchanged there too — but the Space makes the point unmistakable: its subject
   * is `currentSpaceId`, which a replacement *cannot* change, since replacing is
   * accepting the stored version of this very Space. So if the epoch were not
   * read, nothing else would end this draft, and the editor would be left
   * standing over a Space the author never saw, reseeded from the accepted title
   * and one Enter away from renaming it.
   *
   * `hidden: true` and the blank draft are the Map case's, for the reasons
   * written there.
   */
  it('discards a Space rename left open when the stored Space is accepted', async () => {
    const session = await mountedSpaceApp();
    await beginRename('space-title');
    const name = screen.getByRole('textbox', { name: 'Space name' });
    fireEvent.change(name, { target: { value: '   ' } });
    expect(name).toHaveValue('   ');

    await raiseConflict(session);
    expect(screen.getByRole('textbox', { name: 'Space name', hidden: true })).toHaveValue('   ');
    acceptRemote();

    await replacementLanded();
    expect(
      screen.queryByRole('textbox', { name: 'Space name', hidden: true }),
    ).not.toBeInTheDocument();
    expect(await screen.findByTestId('space-title')).toHaveTextContent('Remote space');
  });

  it('discards a Delete Resource confirmation when the stored Space is accepted', async () => {
    const session = await mountedSpaceApp();
    await selectResource('Local resource');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions for Resource Local resource' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from Space' }));

    expect(
      await screen.findByRole('alertdialog', { name: 'Delete from Space Local resource?' }),
    ).toBeVisible();

    await raiseConflict(session);
    acceptRemote();

    await replacementLanded();
    expect(
      screen.queryByRole('alertdialog', { name: 'Delete from Space Local resource?' }),
    ).not.toBeInTheDocument();
    expect(session.getState().working.resources.map(({ id }) => id)).toEqual([RESOURCE_ID]);
  });

  /**
   * React Flow's drag attempt, which ADR 0042 names alongside the title fields.
   *
   * A drag in flight is a draft in two places at once: the render adapter's
   * `dragOrigins` and the live node's position, which has left its authored
   * place and has not been written anywhere. Accepting replaces both — the Resource
   * is drawn where the accepted Space authored it, not where the pointer left
   * it — and no `settled-resource-movement` Edit is derived from a gesture that
   * never settled.
   *
   * The one case here that a single mutation breaks, and the reason is
   * `reconcile`: a surviving Resource takes its position from the *live* node, so a
   * render adapter that kept its projection across the replacement would go on
   * drawing this Resource where the pointer left it, under the accepted Space's
   * title. The unmount cannot cover that — it is a store the unmount does not
   * reach.
   *
   * The drag is left in flight on purpose and released by the `afterEach` above
   * rather than here, because releasing it is not part of what this pins.
   */
  it('drops an in-flight drag and redraws the Resource where the accepted Space places it', async () => {
    const session = await mountedSpaceApp();
    const dragged = nodeOf(RESOURCE_ID);
    expect(dragged).toHaveStyle({ transform: 'translate(10px,20px)' });

    beginDrag(dragged);
    // The exact offset the two moves applied, asserted rather than merely "not
    // where it started": a drag that silently failed to begin would satisfy the
    // discard below for the wrong reason, and this file's whole subject is
    // outcomes that hold for reasons nobody chose.
    expect(dragged).toHaveStyle({ transform: 'translate(130px,80px)' });

    await raiseConflict(session);
    acceptRemote();

    await replacementLanded();
    await waitFor(() =>
      expect(nodeOf(RESOURCE_ID)).toHaveStyle({ transform: 'translate(900px,700px)' }),
    );
    expect(session.getState().working).toEqual(REMOTE);
    expect(await screen.findByRole('heading', { name: 'Remote resource' })).toBeVisible();
  });
});
