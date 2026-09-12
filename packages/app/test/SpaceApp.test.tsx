import { act, fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { newUuid, spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { productDestinationPath } from '@project/http';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type SpaceSession,
} from '@project/persistence';
import { mountSpaceApp } from '../src/SpaceApp';
import { createBrowserLocation } from '../src/browser-location';
import { recordingHistory } from './browser-history';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import {
  beginRename,
  exitSpaceItem,
  createThing,
  createThingControl,
  newDiagram,
  openGraphMenu,
  openDiagramMenu,
  presentControl,
  unavailable,
} from './command-dock';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const OWNED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OUTSIDE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

const snapshot = (title: string, thingTitle: string, x: number, y: number): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title,
      diagrams: [
        {
          id: DIAGRAM_ID,
          title: 'Diagram',
          kind: 'positioned',
          positions: { [THING_ID]: { x, y, open: false } },
          // A Diagram owns at least one Graph (ADR 0040), and one Thing has
          // nothing to connect — so the Graph it opens on holds no Edges.
          graphs: [{ id: OWNED_GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultDiagram: DIAGRAM_ID,
    },
    things: [
      {
        id: THING_ID,
        document: { title: thingTitle, kind: 'markdown', body: thingTitle },
      },
    ],
  });

/**
 * The same Space with its Diagram owning a Graph that reaches a Thing the Space
 * does not hold — the unloadable snapshot every test below is about.
 *
 * An Edge is closed over the Things its owning Diagram positions (ADR 0040), so
 * the dangling endpoint lives inside the Diagram rather than beside it, and
 * intake names it there.
 */
const withDanglingGraph = (base: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...base,
  document: {
    ...base.document,
    title,
    diagrams: (base.document.diagrams ?? []).map((diagram) => ({
      ...diagram,
      graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: THING_ID, to: MISSING_THING_ID }] }],
      // Named outright rather than carried through: replacing the owned Graphs
      // would otherwise strand an inherited `activeGraph` on an id this Diagram
      // no longer holds, and the snapshot would be unloadable for two reasons
      // where these tests are about one.
      activeGraph: GRAPH_ID,
    })),
  },
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
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
});

afterAll(() => vi.unstubAllGlobals());

/**
 * **Exit is withheld from the meta Space, and from nothing else.**
 *
 * The row read "is there a Space I was opened *from*", which is a different
 * question and answers `null` for every Space reached by its own URL —
 * `open`, `openResolvedPath` and the startup path all record no opener. So a
 * pasted link opened a Space whose Exit was greyed out although
 * `openSpaces.exit` would have exited it. The rule the surface means is the one
 * `open-spaces.ts` enforces: the meta Space is permanent and every other open
 * Space can be left.
 */
it('offers Exit on a Space opened by its own address, which has no opener', async () => {
  const meta = snapshot('Meta', 'Meta Thing', 0, 0);
  const other = { ...snapshot('Elsewhere', 'Other Thing', 0, 0), id: newUuid() };
  const backend = new MemorySpaceBackend(
    SPACE_ID,
    [meta, other].map((value) => ({ snapshot: value, revision: 0n, exportedRevision: null })),
  );
  const spaces = createOpenSpaces({
    backend,
    metaSpaceId: SPACE_ID,
    newId: newUuid,
    history: recordingHistory(),
  });
  const initial = await spaces.open(SPACE_ID);
  render(<OpenSpacesApplication spaces={spaces} initial={initial} />);

  // The meta Space is the one that cannot be exited, and it says so.
  expect(unavailable(exitSpaceItem('Meta'))).toBe(true);
  fireEvent.keyDown(document.body, { key: 'Escape' });

  // Opened by id and not from anywhere, which is what a pasted address does.
  await act(async () => {
    await spaces.open(other.id);
  });

  expect(unavailable(exitSpaceItem('Elsewhere'))).toBe(false);
});

it('keeps a hidden Space presentation unchanged when the active Space receives Escape', async () => {
  const base = snapshot('First Space', 'First Thing', 0, 0);
  const first = {
    ...base,
    document: {
      ...base.document,
      diagrams: base.document.diagrams?.map((diagram) => ({
        ...diagram,
        graphs: [{ id: OWNED_GRAPH_ID, title: 'Graph', edges: [{ from: THING_ID, to: THING_ID }] }],
      })),
    },
  };
  const second = { ...snapshot('Second Space', 'Second Thing', 0, 0), id: newUuid() };
  const backend = new MemorySpaceBackend(
    SPACE_ID,
    [first, second].map((value) => ({
      snapshot: value,
      revision: 0n,
      exportedRevision: null,
    })),
  );
  const spaces = createOpenSpaces({
    backend,
    metaSpaceId: SPACE_ID,
    newId: newUuid,
    history: recordingHistory(),
  });
  const initial = await spaces.open(SPACE_ID);
  render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
  await act(async () => {
    initial.app.navigation.present();
    await Promise.resolve();
  });
  expect(initial.app.navigation.getState().mode).toBe('presenting');
  await act(async () => {
    await spaces.open(second.id);
  });

  fireEvent.keyDown(document.body, { key: 'Escape' });

  expect(initial.app.navigation.getState().mode).toBe('presenting');
});

/**
 * The Sidebar's `Ctrl/Cmd-B` had a claim here and it has gone with the key.
 *
 * It proved that a `window` listener reaching every mounted shell only toggled
 * the Space on the canvas. The Command Dock has no global key at all — it is
 * furniture over the canvas rather than a gutter to collapse, so there is
 * nothing to toggle and nothing for a hidden Space to answer wrongly (ADR 0082).
 * The sibling claim above, that Escape reaches only the showing Space, is the
 * one that outlived the surface, and it still stands.
 */

describe('Space app conflict recovery', () => {
  it('replaces the visible runtime and editor placement when remote state is accepted', async () => {
    const local = snapshot('Local space', 'Local thing', 10, 20);
    const remote = snapshot('Remote space', 'Remote thing', 900, 700);
    const backend = new MemorySpaceBackend(SPACE_ID, [
      { snapshot: remote, revision: 4n, exportedRevision: null },
    ]);
    const { spaceSession: session, spaceThings } = openTestSpace(backend, {
      snapshot: local,
      revision: 3n,
      exportedRevision: null,
    });
    session.submit(local);
    await new Promise<void>((resolve) => {
      if (session.getState().persistence.kind === 'conflicted') resolve();
      else {
        const unsubscribe = session.subscribe(() => {
          if (session.getState().persistence.kind !== 'conflicted') return;
          unsubscribe();
          resolve();
        });
      }
    });

    let view: RenderResult | undefined;
    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session }),
        spaceThings,
      },
      (app) => {
        if (view === undefined) view = render(app);
        else view.rerender(app);
      },
    );
    expect(screen.getByText('Local space')).toBeVisible();
    expect(screen.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep local and retry' })).toBeVisible();

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));

    expect(await screen.findByText('Remote space')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Remote thing' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Local thing' })).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(remote);
    const thingNode = screen
      .getByRole('heading', { name: 'Remote thing' })
      .closest('.react-flow__node');
    expect(thingNode).toHaveStyle({ transform: 'translate(900px,700px)' });
  });

  /**
   * A conflicted session whose remote snapshot does not load. Mounted, with the
   * accept already clicked, because both tests below assert on what that leaves
   * behind.
   */
  const refusedRemote = async (): Promise<{ local: SpaceSnapshot; session: SpaceSession }> => {
    const local = snapshot('Local space', 'Local thing', 10, 20);
    const dangling = withDanglingGraph(local, 'Remote space');
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: dangling, revision: 4n, exportedRevision: null },
        },
      ],
    });
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [], control),
      {
        snapshot: local,
        revision: 3n,
        exportedRevision: null,
      },
    );
    session.submit(local);
    await new Promise<void>((resolve) => {
      const unsubscribe = session.subscribe(() => {
        if (session.getState().persistence.kind !== 'conflicted') return;
        unsubscribe();
        resolve();
      });
    });

    let view: RenderResult | undefined;
    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session }),
        spaceThings,
      },
      (app) => {
        if (view === undefined) view = render(app);
        else view.rerender(app);
      },
    );

    fireEvent.click(screen.getByTestId('persistence-accept-remote'));
    return { local, session };
  };

  /**
   * `acceptRemote` is an `onClick` handler (`App.tsx`), and React error
   * boundaries do not catch throws from event handlers — so a throw here escapes
   * to the window rather than reaching `SpaceAppFailure`, and the session has
   * *already* published the unloadable snapshot as settled working state. The
   * page then still shows the stale local Space with no conflict left to
   * resolve and no way back. Validate the remote snapshot before accepting it.
   */
  it('refuses an unloadable remote snapshot instead of accepting it into the session', async () => {
    const { local, session } = await refusedRemote();

    // In the alert's own text, not an attribute: `role="alert"` announces what
    // it contains, and a reason a pointer has to hover to reach is one a
    // keyboard or touch user never gets.
    const refusal = await screen.findByTestId('persistence-remote-refused');
    expect(refusal).toHaveTextContent('The remote space is invalid and was not accepted');
    expect(refusal).toHaveTextContent(MISSING_THING_ID);
    expect(session.getState().working).toEqual(local);
    expect(session.getState().persistence.kind).toBe('conflicted');
  });

  /**
   * A refusal explains one remote snapshot. `resolveConflict` commits again
   * without leaving the conflicted state, so the next conflict can arrive
   * carrying a different — and loadable — remote. Holding the old sentence over
   * it tells the author their work cannot be replaced when in fact it can.
   */
  it('drops a refusal once a different remote snapshot is the one in conflict', async () => {
    const local = snapshot('Local space', 'Local thing', 10, 20);
    const dangling = withDanglingGraph(local, 'Broken remote');
    const loadable = snapshot('Remote space', 'Remote thing', 900, 700);
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: dangling, revision: 4n, exportedRevision: null },
        },
      ],
    });
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: loadable, revision: 5n, exportedRevision: null },
        },
      ],
    });
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [], control),
      {
        snapshot: local,
        revision: 3n,
        exportedRevision: null,
      },
    );
    session.submit(local);
    await waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));

    let view: RenderResult | undefined;
    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session }),
        spaceThings,
      },
      (app) => {
        if (view === undefined) view = render(app);
        else view.rerender(app);
      },
    );
    fireEvent.click(screen.getByTestId('persistence-accept-remote'));
    expect(await screen.findByTestId('persistence-remote-refused')).toBeVisible();

    // `act` around the synchronous publication only, and the wait outside it.
    // Nesting `waitFor` inside `act` puts the commit's asynchronous conflict
    // reply inside the window where Testing Library sets the act environment
    // false on purpose, and React then warns about the very flush it was asked
    // for.
    act(() => {
      session.resolveConflict(local);
    });
    await waitFor(() => {
      const { persistence } = session.getState();
      expect(persistence.kind === 'conflicted' ? persistence.current?.revision : null).toBe(5n);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('persistence-remote-refused')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('persistence-accept-remote')).toBeVisible();
  });

  /**
   * Refusing is not a failure of the Space app: the local work is intact and the
   * conflict is still the session's state, so the page that owns both has to
   * stay. Reporting through the failure panel unmounted the whole tree, which
   * left the author reading why their unsaved work could not be replaced on a
   * screen that no longer showed it — and no control to do anything else.
   */
  it('keeps the conflicted Space on screen when it refuses the remote snapshot', async () => {
    await refusedRemote();

    expect(screen.getByText('Local space')).toBeVisible();
    // Awaited because placement is asynchronous — the Thing arrives with the
    // placement, not with the mount.
    expect(await screen.findByRole('heading', { name: 'Local thing', hidden: true })).toBeVisible();
    expect(screen.getByTestId('persistence-accept-remote')).toBeVisible();
    expect(screen.queryByTestId('space-app-failure')).not.toBeInTheDocument();
  });
});

describe('Space app permanent save refusal', () => {
  it('explains the server refusal and returns the author to their local work', async () => {
    const local = snapshot('Local space', 'Local thing', 10, 20);
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'permanent-failure',
      code: 'invalid-commit',
      message: 'Graph names an absent thing',
    });
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [], control),
      {
        snapshot: local,
        revision: 3n,
        exportedRevision: null,
      },
    );
    session.submit(local);
    await waitFor(() => expect(session.getState().persistence.kind).toBe('rejected'));

    let view: RenderResult | undefined;
    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session }),
        spaceThings,
      },
      (app) => {
        if (view === undefined) view = render(app);
        else view.rerender(app);
      },
    );

    expect(screen.getByRole('alertdialog', { name: 'Changes couldn’t be saved' })).toBeVisible();
    // The code's sentence, not the server's. `message` here is `problem.detail`
    // off the wire, and ADR 0057 leaves the wording to the application.
    expect(screen.getByText('These changes are not in a form the server can store.')).toBeVisible();
    expect(screen.queryByText('Graph names an absent thing')).toBeNull();

    fireEvent.click(screen.getByTestId('persistence-rejection-continue'));

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'Changes couldn’t be saved' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Local thing' })).toBeVisible();
    expect(session.getState().persistence.kind).toBe('rejected');
  });
});

describe('Space app failure reporting', () => {
  it('opens an addressed Graph as navigation context without editing the Space', async () => {
    const addressed = {
      ...snapshot('Space', 'Thing', 10, 20),
      document: {
        ...snapshot('Space', 'Thing', 10, 20).document,
        diagrams: snapshot('Space', 'Thing', 10, 20).document.diagrams?.map((diagram) => ({
          ...diagram,
          graphs: [...diagram.graphs, { id: GRAPH_ID, title: 'Addressed', edges: [] }],
        })),
      },
    };
    const { spaceSession: session, spaceThings } = openTestSpace(new MemorySpaceBackend(SPACE_ID), {
      snapshot: addressed,
      revision: 0n,
      exportedRevision: null,
    });

    mountSpace(
      {
        id: runtime(addressed).id,
        session,
        app: composeApp({ spaceSession: session }),
        spaceThings,
      },
      (app) => render(app),
      {
        selection: DIAGRAM_ID,
        thingId: null,
        graphId: GRAPH_ID,
        presentationThingId: null,
      },
    );

    await screen.findByTestId('selected-canvas');
    expect(presentControl('Addressed')).toBeVisible();
    expect(session.getState().working).toEqual(addressed);
  });

  /**
   * A refused clipboard write is reported, and where depends on which surface
   * asked.
   *
   * The **standing alert** is the report both surfaces share: it is pinned in
   * the shell, over a canvas nothing now covers, so it is visible at every
   * width. That is what changed with the Sidebar — a Sheet used to be drawn over
   * the area the alert renders in, which is the whole reason a copy command had
   * to report a second time in its own label.
   *
   * The **item's own label** survives on the Thing rail, and only there: that
   * menu is on the canvas, over the Thing, so a reader following it is not
   * looking at the shell's corner. The Dock's Graph menu is chrome beside the
   * alert and needs no second voice — see `CommandDock.tsx`.
   *
   * Asserted through `role="alert"`, because the notice really is in the
   * accessibility tree while either menu is open: Base UI's dropdown menu is
   * **not** modal — `MenuPopup` passes `modal: isContextMenu` — so it hides
   * nothing outside the popup.
   */
  it.each([
    { entity: 'Actions for Thing Thing', command: /^Copy link/, reportsInPlace: true },
    { entity: 'Actions for Thing Thing', command: /^Copy permanent link/, reportsInPlace: true },
    { entity: 'Active Graph: Graph', command: /^Copy link/, reportsInPlace: false },
    { entity: 'Active Graph: Graph', command: /^Copy permanent link/, reportsInPlace: false },
  ])(
    'reports a rejected clipboard write from $entity $command without unmounting the Space',
    async ({ entity, command, reportsInPlace }) => {
      const valid = snapshot('Space', 'Thing', 10, 20);
      const { spaceSession: session, spaceThings } = openTestSpace(
        new MemorySpaceBackend(SPACE_ID),
        {
          snapshot: valid,
          revision: 0n,
          exportedRevision: null,
        },
      );
      const clipboardFailure = new Error('Clipboard permission denied');
      const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockRejectedValue(clipboardFailure) },
      });

      try {
        mountSpace(
          {
            id: runtime(valid).id,
            session,
            app: composeApp({ spaceSession: session }),
            spaceThings,
          },
          (app) => render(app),
          {
            selection: DIAGRAM_ID,
            thingId: THING_ID,
            graphId: null,
            presentationThingId: null,
          },
          // The location the Thing is addressed from: `openPath` composes the
          // opening from the same pathname the browser location then follows,
          // so the two agree in production and have to agree here.
          recordingHistory(
            productDestinationPath({
              kind: 'diagram-thing',
              spaceId: SPACE_ID,
              diagramId: DIAGRAM_ID,
              thingId: THING_ID,
            }),
          ),
        );

        fireEvent.click(await screen.findByRole('button', { name: entity }));
        fireEvent.click(await screen.findByRole('menuitem', { name: command }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Link not copied');
        expect(alert).toHaveTextContent('The browser refused clipboard access.');
        expect(screen.getByText('Space')).toBeInTheDocument();

        // The command did not do what its label says, so a rail item does not
        // say it did — it reads the failure in place, over the Thing the reader
        // is looking at. Either way nothing anywhere claims it was copied.
        if (reportsInPlace) {
          expect(await screen.findByRole('menuitem', { name: /^Not copied/ })).toBeVisible();
        }
        expect(screen.queryByRole('menuitem', { name: /^Copied/ })).not.toBeInTheDocument();
      } finally {
        if (previousClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
        else Object.defineProperty(navigator, 'clipboard', previousClipboard);
      }
    },
  );

  /**
   * **A standing report is put away by the reader, not by the next command.**
   *
   * The notice slot is pinned over the canvas *above* the Command Dock — a
   * report drawn behind the furniture it reports for is not a report — and the
   * Dock moves between twelve slots, so at every top slot the two share a
   * corner and the report wins hit testing (`e2e/dock-interactions.spec.ts`).
   * Four of these clear on the next corresponding command and the Space command
   * break clears only when the next switch or exit is attempted, from the Space
   * menu on the bar underneath it. So without a dismissal the reader can be left
   * pressing a control the last failure is sitting on.
   *
   * `AlertAction` is the shared `Alert`'s own slot for exactly this, already
   * spent on Retry by the persistence notice. What is pinned here is that
   * dismissing is *acknowledgement*: the report goes and the Space is untouched.
   */
  it('puts a standing clipboard failure away when the reader dismisses it', async () => {
    const valid = snapshot('Space', 'Thing', 10, 20);
    const { spaceSession: session, spaceThings } = openTestSpace(new MemorySpaceBackend(SPACE_ID), {
      snapshot: valid,
      revision: 0n,
      exportedRevision: null,
    });
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard permission denied')) },
    });

    try {
      mountSpace(
        { id: runtime(valid).id, session, app: composeApp({ spaceSession: session }), spaceThings },
        (app) => render(app),
      );

      openGraphMenu('Graph');
      fireEvent.click(await screen.findByRole('menuitem', { name: /^Copy link/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Link not copied');
      // The menu the command was pressed in, dismissed the way a reader
      // dismisses it — the report is what stands, not the surface behind it.
      fireEvent.keyDown(document.body, { key: 'Escape' });

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Link not copied' }));

      await waitFor(() => expect(screen.queryByText('Link not copied')).toBeNull());
      expect(session.getState().working).toEqual(valid);
    } finally {
      if (previousClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
      else Object.defineProperty(navigator, 'clipboard', previousClipboard);
    }
  });

  /**
   * Composition happens in Open Spaces now, so `createApp` no longer performs
   * domain intake. What it still does before there is a tree is read the
   * session's working Space to open an addressed Graph, and that throws on a
   * snapshot that has since stopped loading. What is pinned is that
   * `mountSpaceApp` reports it rather than throwing at its caller and leaving a
   * blank page — and that it logs, because unlike the boundary below, which
   * React traces for us, nothing else would say what threw.
   */
  it('names a working snapshot that stopped loading instead of blanking the page', () => {
    const valid = snapshot('Space', 'Thing', 10, 20);
    const { spaceSession: session, spaceThings } = openTestSpace(new MemorySpaceBackend(SPACE_ID), {
      snapshot: valid,
      revision: 0n,
      exportedRevision: null,
    });
    const app = composeApp({ spaceSession: session });
    // Written straight onto the session, past the validation every authoring
    // path performs first: reaching this state means an invariant has already
    // broken, which is what the guard is a backstop for.
    session.submit(withDanglingGraph(valid, valid.document.title));
    // React reports a boundary-caught error to `console.error` as well as to the
    // boundary. The report is the point; the duplicate is noise this test owns.
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // `mountSpaceApp` directly, and nothing following: the browser's location
    // follows a Space Open Spaces has validated, and this composition never
    // was one. What is pinned here is the mount, not the location.
    expect(() =>
      mountSpaceApp(
        { id: runtime(valid).id, session, app, spaceThings },
        createBrowserLocation(recordingHistory()),
        (view) => {
          render(view);
        },
        { selection: DIAGRAM_ID, thingId: null, graphId: GRAPH_ID, presentationThingId: null },
      ),
    ).not.toThrow();

    expect(screen.getByTestId('space-app-failure')).toHaveTextContent(MISSING_THING_ID);
    expect(screen.getByRole('heading', { name: 'Unable to open this space' })).toBeVisible();
    expect(reported).toHaveBeenCalledWith('Composing the Space app failed', expect.any(Error));
  });

  /**
   * The other path to the same sentence, and the one the error boundary itself
   * is for: a Space app that composed and mounted, whose snapshot then stops
   * passing intake under it. `App` re-derives the whole aggregate on every
   * render, so the throw lands in the boundary rather than in `mountSpaceApp`.
   */
  it('names a working snapshot that stops loading under a mounted Space app', () => {
    const valid = snapshot('Space', 'Thing', 10, 20);
    const { spaceSession: session, spaceThings } = openTestSpace(new MemorySpaceBackend(SPACE_ID), {
      snapshot: valid,
      revision: 0n,
      exportedRevision: null,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountSpace(
      {
        id: runtime(valid).id,
        session,
        app: composeApp({ spaceSession: session }),
        spaceThings,
      },
      (app) => {
        render(app);
      },
    );

    // Written straight onto the session, past the validation every authoring
    // path performs first: reaching this state means an invariant has already
    // broken, and what is pinned is that it reports rather than blanking.
    act(() => {
      session.submit(withDanglingGraph(valid, valid.document.title));
    });

    expect(screen.getByTestId('space-app-failure')).toHaveTextContent(MISSING_THING_ID);
    expect(screen.getByRole('heading', { name: 'Unable to open this space' })).toBeVisible();
  });
});

/**
 * The Things list is a Popover, so these assert that it is *mounted* rather than
 * that it is visible: Base UI's Positioner holds a popup at `opacity: 0` until
 * it has measured its anchor, and jsdom answers every measurement with zeroes,
 * so `toBeVisible` can never pass here for any popover in the tree
 * (`SelectedEdgeControls`' own tests read the same way). The visibility half of
 * this evidence is the Ladle behaviour test, which runs in a real browser.
 */
describe('Space app Things list', () => {
  it('opens an accessible empty list for a zero-Thing Space, and creates in it', () => {
    const seeded = snapshot('Space', 'Thing', 10, 20);
    const empty: SpaceSnapshot = {
      ...seeded,
      things: [],
      document: {
        ...seeded.document,
        diagrams: seeded.document.diagrams?.map((diagram) => ({ ...diagram, positions: {} })),
      },
    };
    const stored = { snapshot: empty, revision: 1n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );

    mountSpace(
      { id: runtime(empty).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    // Opened by the press, because nothing opens it for the reader any more:
    // first-load initialization authors the Diagram and announces nothing
    // (`.scratch/command-dock/issues/13`).
    fireEvent.click(screen.getByRole('button', { name: 'Things' }));
    expect(screen.getByRole('dialog', { name: 'Things' })).toHaveTextContent(
      'This Space has no Things.',
    );
    expect(unavailable(createThingControl())).toBe(false);
    createThing('Markdown Thing');
    expect(session.getState().working.things).toHaveLength(1);
  });

  /**
   * **Add Diagram opens nothing, and the author continues in the name.**
   *
   * The Things list used to be disclosed here, on the argument that an empty
   * Diagram needs filling. What an author does with a brand-new Diagram is say
   * what it is for — `Diagram 1` is a placeholder nobody wants — and a list that
   * appears in response to a creation is furniture arriving unasked
   * (`.scratch/command-dock/issues/13`).
   */
  it('adds an empty selected Diagram, opens no list, and puts the caret in its name', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );

    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );
    // The Edit is withdrawn until the canvas has a placement to edit against,
    // and so is the rename the continuation lands on. Waited for on the name
    // rather than by reopening the menu: a Base UI menu returns focus to its
    // trigger in a microtask after it closes, so a poll that opened and
    // dismissed this one would leave that return in flight across the press
    // under test and steal the caret from the editor it opens.
    await waitFor(() => expect(unavailable(screen.getByTestId('selected-canvas'))).toBe(false));

    newDiagram('Diagram');

    expect(session.getState().working.document.diagrams).toHaveLength(2);
    expect(session.getState().working.document.diagrams?.[1]?.positions).toEqual({});
    expect(session.getState().working.document.diagrams?.[1]?.graphs).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Things' })).not.toBeInTheDocument();

    const editor = screen.getByRole('textbox', { name: 'Diagram name' });
    expect(editor).toHaveValue('Diagram 1');
    expect(editor).toHaveFocus();
  });

  /**
   * The menu's Edits are withdrawn wherever the chrome title edit is, and a
   * resolved placement is one of that condition's terms
   * (`authoringAvailability`'s `editable` fact).
   *
   * Before the strategy has placed anything there is no projected canvas, which
   * is the state the placeholder above announces. Offering Rename there is
   * offering an item that does nothing — the effect that discards a draft begun
   * against a disabled edit runs on the same render — and offering Delete
   * Diagram there runs a real Edit against a Space with nothing drawn. The copy
   * command stays, because an address is a fact about the entity rather than an
   * Edit.
   *
   * Asserted synchronously, because that is the whole of the window: awaiting
   * anything at all lets the strategy settle and the Edits come back.
   */
  it('withholds a menu’s Edits until the canvas has a placement to edit', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );

    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Arranging…');
    // The Diagram's Edits are withdrawn and its address is not. Renaming is
    // clicking the name the Dock already draws, so the withdrawal is that name
    // going unavailable — `aria-disabled`, not a missing control, exactly as
    // Delete is present and unavailable beside it, because a control that
    // disappears teaches nothing about why. It read `tagName` until the Space's
    // name became renameable too (`renamed-space`): the withheld name used to
    // draw as a label, and the slot is a `ToolbarButton` in both states now.
    expect(unavailable(screen.getByTestId('selected-canvas'))).toBe(true);
    openDiagramMenu('Diagram');
    expect(unavailable(screen.getByRole('menuitem', { name: 'Delete Diagram' }))).toBe(true);
    const create = screen.getByRole('menuitem', { name: 'New Diagram' });
    expect(unavailable(create)).toBe(true);
    fireEvent.click(create);
    expect(session.getState().working.document.diagrams).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: 'Diagram name' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /^Copy link/ })).toBeInTheDocument();
    fireEvent.keyDown(create, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Diagram: Diagram' })).toHaveFocus(),
    );

    // Left settling rather than abandoned mid-placement: the strategy resolves
    // against an unmounted tree otherwise, and the Edits it restores are the
    // other half of the rule.
    await waitFor(() => expect(unavailable(screen.getByTestId('selected-canvas'))).toBe(false));
  });

  /**
   * **A rename cannot outlive the thing it is renaming, and ending it is not a
   * render-time job.**
   *
   * The Dock draws one name cluster and moves it between Diagrams rather than
   * unmounting it, so a Diagram changing under a live editor would leave the
   * caret in a field editing something the reader has already left. The editor
   * is closed by a render-time transition for that reason — but closing it also
   * tells the App a chrome rename has ended, and a *parent's* state cannot be
   * written from a child's render body. React says so out loud, and the state
   * it withdraws is what gates Present, Create Thing and every entity Edit.
   */
  it('ends a live Diagram rename when the Diagram changes, without writing to the App during render', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    newDiagram('Diagram');
    const created = screen.getByTestId('selected-canvas').textContent;
    await beginRename('selected-canvas');
    await screen.findByRole('textbox', { name: 'Diagram name' });

    // Back onto the first Diagram with the caret still in the field.
    openDiagramMenu(created);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Diagram' }));

    expect(screen.queryByRole('textbox', { name: 'Diagram name' })).toBeNull();
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Diagram');
    expect(reported.mock.calls.flat().join(' ')).not.toContain('Cannot update a component');
    reported.mockRestore();
  });

  /**
   * **Where the caret goes when a chrome rename ends.**
   *
   * The editor *replaces* the name it was opened from rather than expanding
   * inside it, so ending the rename unmounts the element holding the caret. The
   * Sidebar answered this with a continuation resolving `layout-header`; the
   * Dock deleted that kind on the grounds that the editor "hands focus back
   * itself", and nothing did — the caret fell to `document.body` and the next
   * Tab restarted from the top of the document. `InlineTitleEditor` calls
   * `onReturnFocus` from its own Enter and Escape handlers for exactly this.
   */
  it('returns the caret to the name it was opened from when a Diagram rename ends', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    await beginRename('selected-canvas');
    const editor = await screen.findByRole('textbox', { name: 'Diagram name' });
    fireEvent.change(editor, { target: { value: 'Workshop' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    const name = screen.getByTestId('selected-canvas');
    expect(name).toHaveTextContent('Workshop');
    expect(document.activeElement).toBe(name);
  });

  /**
   * **A rename the reader ended by leaving does not pull them back.**
   *
   * `InlineTitleEditor` completes on blur as well as on Enter, and only the
   * keyboard exits call `onReturnFocus` — because only they leave the caret
   * with nowhere to be. A blur completion is the reader already putting the
   * caret somewhere they chose, and returning it to the name is taking focus
   * rather than giving it back. The Sidebar spent its continuation from
   * `onReturnFocus` alone for this reason; wiring the same ending into
   * `onComplete` reinstated the theft with the commit as its cover.
   */
  it('leaves the caret where the reader put it when a Diagram rename ends by blur', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    await beginRename('selected-canvas');
    const editor = await screen.findByRole('textbox', { name: 'Diagram name' });
    fireEvent.change(editor, { target: { value: 'Workshop' } });

    // Somewhere else the reader has chosen — the canvas in the product, any
    // focusable element here, because what is pinned is that the Dock does not
    // take it back rather than which element holds it.
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    fireEvent.blur(editor);

    const name = await screen.findByTestId('selected-canvas');
    expect(name).toHaveTextContent('Workshop');
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  /**
   * **One name in the bar is being renamed, or none is.**
   *
   * A blank name is refused and `InlineTitleEditor` holds a refused draft open
   * and editable, so a Diagram rename can still be running while the reader
   * presses the Graph name beside it — the availability rule that stops a
   * *second* Rename beginning reads `editingChromeTitle`, and the name control
   * deliberately does not, because withdrawing it would draw the live editor's
   * own name as a static label.
   *
   * So the second press is reachable, and what it must not do is leave two
   * editors standing over one bar. The exclusivity is the disclosure's, one
   * step along: at most one open id under the whole row, and whichever control
   * opens next clears whatever was open.
   */
  it('leaves one Dock name editor standing when a second rename is begun over a live one', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    await beginRename('selected-canvas');
    const diagramEditor = await screen.findByRole('textbox', { name: 'Diagram name' });
    fireEvent.change(diagramEditor, { target: { value: '' } });
    fireEvent.keyDown(diagramEditor, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Diagram name' })).toBeInTheDocument();

    await beginRename('active-graph');

    expect(screen.getAllByRole('textbox', { name: /^(Diagram|Graph) name$/ })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Graph name' })).toBeInTheDocument();
  });

  /**
   * **What the bar reports and what the bar draws are one answer.**
   *
   * A live chrome rename withdraws Create Thing, Present, Delete Thing and the
   * canvas's own title editing, because each of those re-derives the canvas or
   * takes the caret from under the editor. Three identities drawing three
   * editors over one boolean is what let that come apart: with a blank Diagram
   * draft still refusing, a Graph rename begun and then abandoned with Escape
   * reported the *bar* as idle and handed the commands back underneath an
   * editor that was still on screen.
   *
   * The claim is the coupling rather than either half of it, because the fix is
   * free to end the first rename or to keep it — what it may not do is disagree
   * with itself. Create Thing is the one asserted: it reads `addThing`, which
   * carries `editingChromeTitle` and nothing else about this Space, while
   * Present here is withheld anyway for a Graph with no Edges to traverse.
   */
  it('withdraws Create Thing for as long as a Dock name editor is standing', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    await beginRename('selected-canvas');
    const diagramEditor = await screen.findByRole('textbox', { name: 'Diagram name' });
    fireEvent.change(diagramEditor, { target: { value: '' } });
    fireEvent.keyDown(diagramEditor, { key: 'Enter' });
    expect(unavailable(createThingControl())).toBe(true);

    await beginRename('active-graph');
    const graphEditor = await screen.findByRole('textbox', { name: 'Graph name' });
    fireEvent.keyDown(graphEditor, { key: 'Escape' });

    const standing =
      screen.queryAllByRole('textbox', { name: /^(Diagram|Graph) name$/ }).length > 0;
    expect(unavailable(createThingControl())).toBe(standing);
  });

  /**
   * **The last Diagram cannot be deleted, and the Dock says so before the press.**
   *
   * ADR 0079 keeps a Space on at least one Diagram. The Sidebar let the command
   * run and printed the refusal afterwards; the Dock draws it present and
   * unavailable instead — a control that disappears teaches nothing about why,
   * and one that refuses every time teaches it a press too late. So what is
   * pinned here is the availability, and then the ordinary lifecycle once a
   * second Diagram exists: rename in place, delete, and the selection landing
   * back on what is left.
   */
  it('withholds Delete from the last Diagram and runs the lifecycle once there are two', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const stored = { snapshot: base, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );

    mountSpace(
      { id: runtime(base).id, session, app: composeApp({ spaceSession: session }), spaceThings },
      (app) => render(app),
    );

    openDiagramMenu('Diagram');
    expect(unavailable(screen.getByRole('menuitem', { name: 'Delete Diagram' }))).toBe(true);
    // Dismissed and settled before the creation. A Base UI menu returns focus to
    // its trigger in a microtask after it closes, so a close left in flight
    // across the next press lands on the trigger *after* New Diagram has opened
    // the new Diagram's name editor — blurring an editor whose blur completes.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    // Add Diagram continues in the new Diagram's name, so the editor is already
    // open and there is no second gesture to begin the rename with.
    newDiagram('Diagram');
    const editor = screen.getByRole('textbox', { name: 'Diagram name' });
    fireEvent.change(editor, { target: { value: 'Workshop' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Workshop');

    // The rename replaced the placement, and a menu's Edits are withdrawn until
    // the canvas has one to edit against.
    await waitFor(() => expect(unavailable(screen.getByTestId('selected-canvas'))).toBe(false));
    openDiagramMenu('Workshop');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Workshop' }));
    expect(session.getState().working.document.diagrams).toHaveLength(1);
    expect(session.getState().working.things).toEqual(base.things);
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Diagram');
  });

  /**
   * **A Diagram refusal was pinned here and its one route has gone.**
   *
   * The claim was that a Delete Diagram refusal does not outlive its own Diagram:
   * the refusal is drawn in the shell's standing notice, which every Diagram
   * shows, so one left standing explained a Diagram the reader had already left.
   * The only way to produce it was Delete on the last Diagram, and the Command
   * Dock withholds that command before the press (ADR 0079) — which the test
   * above now pins instead.
   *
   * What is left is a race: a Delete whose Diagram is gone by the time the press
   * lands refuses `diagram-not-found`. That is real, the alert and the clearing
   * effect are both still there for it, and it is not reachable from a mount —
   * so this is a note rather than a test, and the effect is one an integration
   * run would have to catch.
   */

  it('keeps the Things list closed after the reader closes it, even once the Space gains another Thing', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const local: SpaceSnapshot = {
      ...base,
      things: [
        ...base.things,
        { id: OUTSIDE_THING_ID, document: { title: 'Outside thing', kind: 'markdown', body: '' } },
      ],
    };
    const stored = { snapshot: local, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );

    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session, selection: DIAGRAM_ID }),
        spaceThings,
      },
      (app) => render(app),
      {
        selection: DIAGRAM_ID,
        thingId: OUTSIDE_THING_ID,
        graphId: null,
        presentationThingId: null,
      },
      // The Thing is in no Diagram, so the address that names it is the canonical
      // one — which opens the Space's default Diagram, the one selected here.
      recordingHistory(
        productDestinationPath({ kind: 'thing', spaceId: SPACE_ID, thingId: OUTSIDE_THING_ID }),
      ),
    );

    expect(
      screen.getByRole('button', { name: 'Add Outside thing to Diagram' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Things' }));
    expect(
      screen.queryByRole('button', { name: 'Add Outside thing to Diagram' }),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(unavailable(createThingControl())).toBe(false));
    const before = session.getState().working.things.length;
    createThing('Markdown Thing');
    expect(session.getState().working.things.length).toBe(before + 1);

    expect(
      screen.queryByRole('button', { name: 'Add Outside thing to Diagram' }),
    ).not.toBeInTheDocument();
  });

  /**
   * A chrome title draft belongs to the Diagram it was begun on, and a Back that
   * lands on another Diagram discards it.
   *
   * The Graph subject is the demanding one: Graph rows are the selected
   * Diagram's, so the arrival unmounts the row the draft was begun on. A draft
   * outliving that has no editor left to cancel it and still withdraws Add
   * Thing, Present, Delete Thing and every entity menu's Edits.
   *
   * Choosing a Diagram row spends `setSpaceChromeEdit(null)` at the call site,
   * and this arrival does not — it is `authoringAvailability`'s
   * `chromeTitleEdit` that answers it,
   * because the Diagram change clears the published projection and the canvas
   * holds no Things until placement resolves. That is one clear standing on
   * another's condition, which is why the behaviour is pinned here rather than
   * left to the reader of either.
   */
  it('discards an open chrome title draft when a Back moves to another Diagram', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const local: SpaceSnapshot = {
      ...base,
      document: {
        ...base.document,
        diagrams: [
          ...(base.document.diagrams ?? []),
          {
            id: OTHER_DIAGRAM_ID,
            title: 'Other Diagram',
            kind: 'positioned',
            // The Thing is placed here too, so this Diagram stays editable: an
            // empty Diagram withdraws chrome editing on its own and would clear
            // the draft for a reason that has nothing to do with the arrival.
            positions: { [THING_ID]: { x: 40, y: 50, open: false } },
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
          },
        ],
      },
    };
    const stored = { snapshot: local, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    const history = recordingHistory(
      productDestinationPath({ kind: 'diagram', spaceId: SPACE_ID, diagramId: DIAGRAM_ID }),
    );

    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session, selection: DIAGRAM_ID }),
        spaceThings,
      },
      (app) => render(app),
      { selection: DIAGRAM_ID, thingId: null, graphId: null, presentationThingId: null },
      history,
    );

    // The Graph's name is renamed where it is drawn, exactly as the Diagram's is.
    await beginRename('active-graph');
    expect(await screen.findByRole('textbox', { name: 'Graph name' })).toBeVisible();
    expect(unavailable(createThingControl())).toBe(true);

    act(() => {
      history.popTo(
        productDestinationPath({ kind: 'diagram', spaceId: SPACE_ID, diagramId: OTHER_DIAGRAM_ID }),
      );
    });

    expect(await screen.findByTestId('selected-canvas')).toHaveTextContent('Other Diagram');
    expect(screen.queryByRole('textbox', { name: 'Graph name' })).not.toBeInTheDocument();
    expect(unavailable(createThingControl())).toBe(false);
  });

  it('reveals the addressed Thing again in a newly adopted default Diagram that omits it, even though the same Thing was already addressed once', async () => {
    const base = snapshot('Space', 'Thing', 10, 20);
    const local: SpaceSnapshot = {
      ...base,
      document: {
        ...base.document,
        diagrams: [
          ...(base.document.diagrams ?? []),
          {
            id: OTHER_DIAGRAM_ID,
            title: 'Other Diagram',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
          },
        ],
        // The canonical Thing link below resolves to the Space's default
        // Diagram, so this second navigation lands on the Diagram that omits
        // the Thing rather than the one it started on.
        defaultDiagram: OTHER_DIAGRAM_ID,
      },
    };
    const stored = { snapshot: local, revision: 0n, exportedRevision: null };
    const { spaceSession: session, spaceThings } = openTestSpace(
      new MemorySpaceBackend(SPACE_ID, [stored]),
      stored,
    );
    const history = recordingHistory(
      productDestinationPath({
        kind: 'diagram-thing',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM_ID,
        thingId: THING_ID,
      }),
    );

    mountSpace(
      {
        id: runtime(local).id,
        session,
        app: composeApp({ spaceSession: session, selection: DIAGRAM_ID }),
        spaceThings,
      },
      (app) => render(app),
      {
        selection: DIAGRAM_ID,
        thingId: THING_ID,
        graphId: null,
        presentationThingId: null,
      },
      history,
    );

    // Thing is a member of the selected Diagram, so there is nothing to reveal yet.
    expect(screen.queryByRole('button', { name: 'Add Thing to Diagram' })).not.toBeInTheDocument();

    // The second of the two mount tests, and the other direction: a Back the
    // injected History API reports has to reach Navigation and redraw. The
    // canonical Thing link carries no Diagram of its own — it opens wherever the
    // Space's default Diagram is, which is now the Diagram that omits this Thing.
    act(() => {
      history.popTo(
        productDestinationPath({ kind: 'thing', spaceId: SPACE_ID, thingId: THING_ID }),
      );
    });

    expect(await screen.findByTestId('selected-canvas')).toHaveTextContent('Other Diagram');
    expect(await screen.findByRole('button', { name: 'Add Thing to Diagram' })).toBeVisible();
  });
});
