import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import {
  encodeCompactUuid,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import type { HistoryApi } from '../src/browser-location';
import { recordingHistory } from './browser-history';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
import {
  createResource,
  createResourceControl,
  deleteMapItem,
  deleteGraphItem,
  identityRenameItem,
  newGraphItem,
  newMapItem,
  openMapMenu,
  presentControl,
  unavailable,
} from './command-dock';
import { selectResource } from './resource-selection';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SECOND_REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');

/** Replace CodeMirror source through its public editable surface. */
const replaceMarkdownSource = (value: string): HTMLElement => {
  const source = screen.getByRole('textbox', { name: 'Markdown source of A' });
  source.focus();
  fireEvent.keyDown(source, { key: 'a', ctrlKey: true });
  fireEvent.paste(source, { clipboardData: { getData: () => value } });
  return source;
};

/**
 * Two Resources on one Graph the Map owns, so the graph opens on a Positioned
 * canvas with a placement already installed and presenting has a traversal to
 * run.
 */
const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [RESOURCE_ID]: { x: 10, y: 20, open: false },
          [OTHER_RESOURCE_ID]: { x: 300, y: 20, open: false },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Graph', edges: [{ from: RESOURCE_ID, to: OTHER_RESOURCE_ID }] },
        ],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_RESOURCE_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

/**
 * The same content drawn three times: Resource A and two Reference Resources of it, each placed
 * and titled in its own right.
 *
 * One Reference Resource can only show that its target changed, which is the weaker half of
 * a single source of truth. Two is where an edit made through one occurrence
 * has somewhere else to be wrong — and where the editor's composite key stops
 * being redundant, since both Reference Resources resolve to the same content id.
 */
const twiceReferenced: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: [
      {
        ...snapshot.document.maps![0],
        positions: {
          ...snapshot.document.maps![0]!.positions,
          [REFERENCE_ID]: { x: 600, y: 20, open: false },
          [SECOND_REFERENCE_ID]: { x: 900, y: 20, open: false },
        },
      },
    ],
  },
  resources: [
    ...snapshot.resources,
    { id: REFERENCE_ID, document: { title: 'A again', kind: 'reference', target: RESOURCE_ID } },
    {
      id: SECOND_REFERENCE_ID,
      document: { title: 'A once more', kind: 'reference', target: RESOURCE_ID },
    },
  ],
});

/** The default Map with two Graphs so Delete Graph is available. */
const twoGraphs: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: [
      {
        ...snapshot.document.maps![0]!,
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Graph',
            edges: [{ from: RESOURCE_ID, to: OTHER_RESOURCE_ID }],
          },
          { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
        ],
      },
    ],
  },
});

/**
 * The same Space with a second Map, so a location can name a Map the
 * Space does not open on by default.
 */
const secondMap: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: [
      ...snapshot.document.maps!,
      {
        id: OTHER_MAP_ID,
        title: 'Other Map',
        kind: 'positioned',
        positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
      },
    ],
  },
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(value: SpaceSnapshot = snapshot, history?: HistoryApi): SpaceSession {
  const stored = { snapshot: value, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceResources } = openTestSpace(
    MemorySpaceBackend.asMeta(stored),
    stored,
  );
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(value).id,
      session,
      app: composeApp({ spaceSession: session }),
      spaceResources,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
    undefined,
    history,
  );
  return session;
}

const resourceTitleOf = (session: SpaceSession, resourceId: string): string | undefined =>
  session.getState().working.resources.find((resource) => resource.id === resourceId)?.document
    .title;

const bodyOf = (session: SpaceSession, resourceId: string): string | undefined => {
  const document = session
    .getState()
    .working.resources.find((resource) => resource.id === resourceId)?.document;
  return document?.kind === 'markdown' ? document.body : undefined;
};

/**
 * Persistence is asynchronous and the strategy that places Resources is too, so a
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

describe('authoring a Resource title on the graph', () => {
  /**
   * `z.string().min(1)` counts characters, and a space is one — so the schema
   * alone accepts a title that draws as nothing, leaving a Resource that cannot be
   * told apart from its neighbours and an `Edit title of` label naming nobody.
   * Blank is the empty case wearing different bytes.
   */
  it('refuses a blank title and leaves the stored Resource alone', async () => {
    const session = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(resourceTitleOf(session, RESOURCE_ID)).toBe('A');
    await settled(session);
  });

  /**
   * A refused title draft has nowhere to go but the editor still holding it.
   *
   * Add Map selects the empty Map it creates, so the canvas re-derives
   * with no nodes at all and the edited Resource unmounts — taking the draft text,
   * the announced reason and the caret with it, with neither of the Title's own
   * exits spent. A *valid* draft is safe without this gate, because the
   * button's own mousedown blurs the input and a valid blur completes the Title
   * (ADR 0065); a refused one is re-focused instead and the click lands anyway.
   */
  it('withdraws chrome authoring while a Resource title editor holds a refused draft', async () => {
    const session = mount();
    // **New Map is the control, and Create Resource is deliberately not.** The
    // two read different terms and the difference is the claim: `createMap`
    // requires a ready chrome name, because creating a Map *selects* it
    // and the canvas re-derives with no nodes at all — a Resource holding a live
    // draft unmounts. Creating a Resource re-derives nothing under the editor, so
    // it stays available, which is why the assertion below is on New Map
    // even though it sits behind a disclosure.
    await screen.findByTestId('selected-canvas');
    await waitFor(() => expect(unavailable(newMapItem('Map'))).toBe(false));

    // **The disclosure `newMapItem` opened is dismissed before the canvas is
    // pressed.** One open id under the whole row means a press landing while a
    // menu is open is an *outside* press, which Base UI spends on dismissing —
    // so the press below would reach the Resource only by whatever jsdom happens to
    // do with the event, and the same shape has already produced one flake in
    // the browser suite. Every helper in `command-dock.ts` opens with this line
    // for the same reason.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');

    const newMap = newMapItem('Map');
    expect(unavailable(newMap)).toBe(true);

    // And the draft survives the attempt, which is what the gate is for.
    fireEvent.click(newMap);
    expect(session.getState().working.document.maps).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
    await settled(session);
  });

  /**
   * The Map cluster's Delete reads *two* rules, and the ADR one is not the
   * one under test.
   *
   * `maps.length <= 1` is the rule the row wears on its sleeve (ADR 0079),
   * and a Space with two Maps satisfies it — so what is left to prove is the
   * other one. Every entity Edit is withdrawn while a Resource title editor holds a
   * refused draft, exactly as New Map above is, and a Delete drawn available
   * in that state is a destructive command that presses cleanly and does
   * nothing.
   */
  it('withdraws Delete Map while a Resource title editor holds a refused draft', async () => {
    const session = mount(secondMap);
    await screen.findByTestId('selected-canvas');
    await waitFor(() => expect(unavailable(deleteMapItem('Map'))).toBe(false));
    fireEvent.keyDown(document.body, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');

    const deleteMap = deleteMapItem('Map');
    expect(unavailable(deleteMap)).toBe(true);

    // And the Space still has both Maps, which is what an unavailable
    // destructive command is for.
    fireEvent.click(deleteMap);
    expect(session.getState().working.document.maps).toHaveLength(2);
    await settled(session);
  });

  /**
   * The Graph cluster's own lifecycle commands read the same withdrawal.
   *
   * New Graph, Delete Graph and Recolour are entity Edits exactly as New Map
   * and Delete Map are, and they went out un-gated: the rows pressed
   * cleanly, `authoring.complete` answered `refused`, and the answer was
   * discarded with nothing drawn anywhere. This asserts the gate; the refusal
   * the notice draws is the other half.
   */
  it('withdraws New Graph while a Resource title editor holds a refused draft', async () => {
    const session = mount();
    await screen.findByTestId('selected-canvas');
    await waitFor(() => expect(unavailable(newGraphItem('Graph'))).toBe(false));
    fireEvent.keyDown(document.body, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');

    const newGraph = newGraphItem('Graph');
    expect(unavailable(newGraph)).toBe(true);

    fireEvent.click(newGraph);
    expect(session.getState().working.document.maps?.[0]?.graphs).toHaveLength(1);
    await settled(session);
  });

  it('withdraws Delete Graph while a Resource title editor holds a refused draft', async () => {
    const session = mount(twoGraphs);
    await screen.findByTestId('selected-canvas');
    await waitFor(() => expect(unavailable(deleteGraphItem('Graph'))).toBe(false));
    fireEvent.keyDown(document.body, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');

    const deleteGraph = deleteGraphItem('Graph');
    expect(unavailable(deleteGraph)).toBe(true);

    fireEvent.click(deleteGraph);
    expect(session.getState().working.document.maps?.[0]?.graphs).toHaveLength(2);
    await settled(session);
  });

  it('stores a Title normalized the way the schema normalizes it', async () => {
    const session = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    // Every line loses its trailing whitespace and the trailing blank line
    // goes, which is the rule a whole-string trim cannot express: it never
    // reaches the spaces after `A subtitle` (ADR 0083).
    fireEvent.change(input, { target: { value: 'Renamed A  \nA subtitle   \n' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(resourceTitleOf(session, RESOURCE_ID)).toBe('Renamed A\nA subtitle');
    await settled(session);
  });

  /**
   * A Title written on more than one line reaches the Resource whole (ADR 0083).
   *
   * The line breaks are the author's and the schema is where a Title is
   * normalized, so what this holds is that nothing between the field and the
   * stored document trims them back to one line.
   */
  it('stores a Title written on more than one line', async () => {
    const session = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, {
      target: { value: 'Auth  \nThe service, not the screen\n\nOwned by platform\n' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(resourceTitleOf(session, RESOURCE_ID)).toBe(
      'Auth\nThe service, not the screen\n\nOwned by platform',
    );
    await settled(session);
  });

  /**
   * Blank is still the empty case wearing different bytes, and a draft of
   * nothing but line breaks is the shape the capability adds. The sentence is
   * the application's for the domain's stable code (ADR 0057).
   */
  it('refuses a Title of nothing but line breaks and keeps the draft', async () => {
    const session = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: '\n  \n\n' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
    expect(input).toHaveValue('\n  \n\n');
    expect(input).toHaveFocus();
    expect(resourceTitleOf(session, RESOURCE_ID)).toBe('A');
    await settled(session);
  });
});

/**
 * The gap between `present()`'s refusal and the control that calls it, at the one
 * place it now opens.
 *
 * Dropping a Graph's minimum Edge count made an empty Graph legal, and ADR 0040
 * made it *ordinary*: creating a Map mints its one
 * Active Graph holds nothing, so this is the state the author is in immediately
 * after their first edit on the Flow view. `graphStartResource` has no answer for
 * such a Graph, so `present()` returns having changed nothing — and an enabled
 * control would read `Present` and swallow the click, which is verbatim the
 * defect a fully cyclic Graph produced before its guard was split out.
 *
 * Neither half proves this on its own: the refusal is in Navigation and the
 * enablement is in `GraphSelector`, and what went wrong was that they disagreed.
 */
describe('presenting from a Map', () => {
  it('offers Present on a Map whose Active Graph holds an Edge', async () => {
    // The other half of the same control, and the reason it is here: the test
    // above passes just as well against a Present that is disabled always, so
    // on its own it cannot tell "refuses an empty Graph" from "refuses
    // everything". `snapshot`'s Map owns one Graph with one Edge, which is
    // the smallest presentable Space.
    const session = mount(snapshot);

    await screen.findByTestId('selected-canvas');
    expect(unavailable(presentControl('Graph'))).toBe(false);
    await settled(session);
  });
});

describe('the browser location, from the surface', () => {
  /**
   * One of two mount tests left, and the whole of what a mount can add.
   *
   * Every rule about *what* a position deserves is `browser-location.test.ts`'s,
   * proved against a recording `HistoryApi` with no DOM. What only a mount can
   * show is that the Map row spends its choice on that module rather than on
   * a browser of its own — so this asserts the write reached the seam, and
   * nothing about how the seam decided.
   */
  it('spends a Map choice on the injected History API', async () => {
    const mapView = `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}`;
    const history = recordingHistory(mapView);
    const session = mount(secondMap, history);
    await screen.findByTestId('selected-canvas');

    openMapMenu('Map');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Other Map' }));

    await waitFor(() =>
      expect(history.writes).toEqual([
        {
          method: 'push',
          path: `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(OTHER_MAP_ID)}`,
        },
      ]),
    );
    await settled(session);
  });
});

/** Select Resource A, open it in place, then put its Markdown body under the caret. */
async function openEditor(): Promise<void> {
  await selectResource('A');
  fireEvent.click(await screen.findByRole('button', { name: 'Open Resource A' }));
  await screen.findByTestId('markdown-resource-body-edit-target');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Resource A' }));
  await screen.findByRole('textbox', { name: 'Markdown source of A' });
}

describe('authoring an opened Resource', () => {
  it('renames a Reference Resource through the shared Title interaction and preserves Target content', async () => {
    const referenced = spaceSnapshotSchema.parse({
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: [
          {
            ...snapshot.document.maps![0],
            positions: {
              ...snapshot.document.maps![0]!.positions,
              [REFERENCE_ID]: { x: 600, y: 20, open: false },
            },
          },
        ],
      },
      resources: [
        ...snapshot.resources,
        {
          id: REFERENCE_ID,
          document: {
            title: 'A again',
            kind: 'reference',
            target: RESOURCE_ID,
          },
        },
      ],
    });
    const session = mount(referenced);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A again' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resource title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Resource title' }), { key: 'Enter' });

    expect(session.getState().working.resources).toContainEqual(snapshot.resources[0]);
    expect(session.getState().working.resources).toContainEqual({
      ...referenced.resources[2],
      document: { ...referenced.resources[2]!.document, title: 'Recap' },
    });
    await settled(session);
  });

  /**
   * "Every place showing that content changes together" is the promise, and one
   * Reference Resource cannot test it: reading the edit back through the target only says the
   * target was written. A second Reference Resource is a second occurrence that has to have
   * moved with it, and it never touched the edit itself.
   */
  it('updates shared content only when its Target is opened explicitly', async () => {
    const session = mount(twiceReferenced);

    await openEditor();
    replaceMarkdownSource('Written once, shown everywhere');
    fireEvent.click(screen.getByRole('button', { name: 'Save Resource A' }));

    expect(bodyOf(session, RESOURCE_ID)).toBe('Written once, shown everywhere');
    expect(session.getState().working.resources).toContainEqual(twiceReferenced.resources[2]);
    expect(session.getState().working.resources).toContainEqual(twiceReferenced.resources[3]);
    await settled(session);
  });

  it('opens each Reference Resource on resolved Target content without a source editor', async () => {
    const session = mount(twiceReferenced);

    await selectResource('A again');
    fireEvent.click(await screen.findByRole('button', { name: 'Open Resource A again' }));
    expect(await screen.findByText('A source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Resource A again' }));

    await selectResource('A once more');
    fireEvent.click(await screen.findByRole('button', { name: 'Open Resource A once more' }));
    expect(await screen.findByText('A source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    expect(bodyOf(session, RESOURCE_ID)).toBe('A source');
    await settled(session);
  });

  /**
   * Escape cancels the body draft and returns the open Resource to rendered Markdown.
   */
  it('cancels the edit on Escape without committing the draft', async () => {
    const session = mount();
    await openEditor();
    const source = replaceMarkdownSource('Draft nobody asked to lose');

    fireEvent.keyDown(source, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.getByText('A source')).toBeVisible();
    expect(bodyOf(session, RESOURCE_ID)).toBe('A source');
    await settled(session);
  });

  /**
   * Presenting draws the active Resource's content *in place of* the Resource
   * (`showActiveResourceContent`), so a live editor cannot survive it and its draft
   * would go with none of ADR 0064's four exits spent. Rather than let a mode
   * change discard a document, presenting is unavailable while an edit runs and
   * the author settles it first.
   *
   * This is the one control outside the canvas that needs to know an edit is
   * running, and since ADR 0089 retired the creation panes there is no modal
   * surface left that could need it too.
   */
  it('cannot start presenting over a live content edit', async () => {
    const session = mount();
    await openEditor();
    expect(screen.getByRole('button', { name: 'Save Resource A' })).toBeVisible();

    expect(unavailable(presentControl('Graph'))).toBe(true);
    fireEvent.click(presentControl('Graph'));

    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
    await settled(session);
  });

  it('presents once the author has settled the edit', async () => {
    const session = mount();
    await openEditor();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      key: 'Escape',
    });

    fireEvent.click(presentControl('Graph'));

    expect(screen.queryByRole('button', { name: /^Open Resource/ })).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * Add Resource finishes by putting a caret in the created Resource's title editor, and
   * title editing is withdrawn while a content edit owns the keyboard (ADR
   * 0064). The canvas already withholds the `C` shortcut for that reason; the
   * toolbar reaches the same operation and had to agree, or one of the two paths
   * created a Resource the author was never given the editor to name.
   */
  it('cannot add a Resource over a live content edit', async () => {
    const session = mount();
    await openEditor();

    const create = createResourceControl();
    expect(unavailable(create)).toBe(true);
    fireEvent.click(create);

    expect(session.getState().working.resources).toHaveLength(2);
    await settled(session);
  });

  /**
   * The Map's rename is withdrawn while a Resource title editor owns the caret;
   * its address is not.
   *
   * Renaming a Map is the very chrome title edit that condition withdraws.
   * Copying an address is not an edit at all — an address is a fact about the
   * Map rather than a change to it — so the menu stays and only Rename is
   * unavailable. The name is the disclosure, so switching stays reachable.
   */
  /** The three names the Dock draws, which the one `chromeTitleEdit` answers for. */
  const CHROME_IDENTITIES = ['space-title', 'selected-canvas', 'active-graph'] as const;

  it('withdraws all three chrome renames while a Resource title editor is open', async () => {
    const session = mount();
    await settled(session);

    // **All three, because one `chromeTitleEdit` answers for the whole bar.**
    // `renamed-space` put the Space behind that guard beside the Map and the
    // Graph, and the claim the branch makes is that the three go together. Read
    // on the Map alone, a regression leaving the Space's name live while a
    // Resource title editor owned the caret passed every suite — which is the one
    // collision the guard exists to prevent.
    for (const identity of CHROME_IDENTITIES) {
      expect([identity, unavailable(identityRenameItem(identity))]).toEqual([identity, false]);
    }
    fireEvent.keyDown(document.body, { key: 'Escape' });

    createResource('Markdown Resource');
    expect(await screen.findByRole('textbox', { name: 'Resource title' })).toBeVisible();

    for (const identity of CHROME_IDENTITIES) {
      expect([identity, unavailable(identityRenameItem(identity))]).toEqual([identity, true]);
    }
    await settled(session);
  });

  it('adds a Resource again once the author has settled the edit', async () => {
    const session = mount();
    await openEditor();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      key: 'Escape',
    });

    createResource('Markdown Resource');

    expect(session.getState().working.resources).toHaveLength(3);
    expect(await screen.findByRole('textbox', { name: 'Resource title' })).toHaveValue(
      'Resource 1',
    );
    await settled(session);
  });

  /**
   * The pane keeps its draft in `useState`, seeded once from the Resource it was
   * mounted on. Opening a second Resource without closing the first therefore had
   * the same React element in the same position — so the state survived while
   * `resource.id` changed underneath it, and the fields were now A's text wearing
   * B's identity. `Done` then wrote A's title and body over B.
   *
   * The pane traps focus, but the invariant still has to survive an event from
   * a node behind it — including a synthetic or stale event delivered after the
   * pane opened.
   *
   * The node is found by its test id rather than by its heading, because the
   * pane hides the graph behind it from the accessibility tree (`hideOthers`,
   * ADR 0047) and a role query answers only what is in that tree. Dispatching
   * onto the element is still the point: this is a keypress reaching a node the
   * author cannot see.
   */
  it('never carries one Resource’s draft onto another', async () => {
    const session = mount();
    await openEditor();
    replaceMarkdownSource('A rewritten');

    fireEvent.keyDown(screen.getByTestId(`rf__node-${OTHER_RESOURCE_ID}`), { key: 'Enter' });

    // Whatever the pane shows, it must not be A's draft under B's id.
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveTextContent(
      'A rewritten',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Resource A' }));

    expect(resourceTitleOf(session, OTHER_RESOURCE_ID)).toBe('B');
    expect(bodyOf(session, OTHER_RESOURCE_ID)).toBe('B source');
    await settled(session);
  });

  /**
   * A click outside the editor ends nothing; Escape still cancels from the source.
   */
  it('closes without committing when Escape is pressed outside the fields', async () => {
    const session = mount();
    await openEditor();
    replaceMarkdownSource('A rewritten');

    fireEvent.click(screen.getByTestId(`rf__node-${OTHER_RESOURCE_ID}`));
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(bodyOf(session, RESOURCE_ID)).toBe('A source');
    await settled(session);
  });
});

/*
 * Opening a Space Resource is deliberately not covered here.
 *
 * It used to be, as the one kind Opening refused — and that refusal is gone:
 * Opening is one Map-owned Edit that asks no question about the Resource's kind
 * (ADR 0064), and a Space Resource has something to draw Open, being the Map
 * it selects of the Space it references (ADR 0068). The behaviour needs a
 * *second* stored Space to be about anything, and this file's fixture is one
 * Space over a backend that holds only it, so the test moved whole to
 * `space-resource-selection.test.tsx` rather than being weakened to fit here.
 */
describe('the Resource affordance on the graph', () => {
  it('opens the Resource on rendered Markdown in place', async () => {
    const session = mount();

    await selectResource('A');
    fireEvent.click(await screen.findByRole('button', { name: 'Open Resource A' }));
    expect(await screen.findByText('A source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Resource A' })).toBeVisible();
    await settled(session);
  });

  /**
   * No gesture on a Resource's body opens it (ADR 0036); the Title and Opening each
   * have their own explicit control.
   */
  it('is the only pointer graph in — the Resource body opens nothing', async () => {
    const session = mount();
    const resource = (await screen.findByRole('heading', { name: 'A' })).closest(
      '.react-flow__node',
    );
    if (resource === null) throw new Error('Resource A is not drawn as a node');

    fireEvent.click(resource);
    fireEvent.doubleClick(resource);

    // The authored Open state itself, and the control an Open Resource offers. The
    // Resource the gesture lands on is the evidence: a pane that is no longer built
    // cannot be absent from the document for a reason this test is about.
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Close Resource A' })).not.toBeInTheDocument();
    await settled(session);
  });
});
