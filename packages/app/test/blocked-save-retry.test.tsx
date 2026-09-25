import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '@project/persistence';
import { createOpenSpaces, type OpenSpace, type OpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';

/**
 * Code-quality ticket 24, through the application: a coordinated save whose
 * recovery another coordination blocks says which Space blocks it, reaches that
 * Space, and saves the Edits it kept only when Retry is pressed.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const metaSnapshot: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: MAP_ID,
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
  },
  resources: [{ id: RESOURCE_ID, document: { title: 'Notes', kind: 'markdown', body: '' } }],
};

/** Distinct ids for the two coordinations, each of which mints several. */
const countingIds = (): (() => UUID) => {
  let next = 0x20;
  return () => uuidSchema.parse(`00000000-0000-4000-8000-0000000000${(next++).toString(16)}`);
};

const EDITED = 'Notes edited while blocked';
const notes = { title: 'Notes', kind: 'markdown', body: '' } as const;

/** Meta with its one Resource retitled: the Edit a blocked save keeps. */
const withNotesTitled = (space: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...space,
  resources: space.resources.map((resource) =>
    resource.id === RESOURCE_ID
      ? { ...resource, document: { ...resource.document, title } }
      : resource,
  ),
});

const notesTitle = (space: OpenSpace): string | undefined =>
  space.session.getState().working.resources.find(({ id }) => id === RESOURCE_ID)?.document.title;

const renamed = (space: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...space,
  document: { ...space.document, title },
});

/** The Space a Space Resource in `containing` points at. */
const targetOf = (containing: OpenSpace, resourceId: UUID): UUID => {
  const resource = containing.session
    .getState()
    .working.resources.find(({ id }) => id === resourceId);
  if (resource?.document.kind !== 'space') throw new Error('No Space Resource was created');
  return resource.document.spaceId;
};

const liveSession = (openSpaces: OpenSpaces, spaceId: UUID): OpenSpace['session'] => {
  const entry = openSpaces.entry(spaceId);
  if (entry === undefined) throw new Error(`Space ${spaceId} is not open`);
  return entry.session;
};

/**
 * C0 creates TARGET in Meta and is rejected; C1 creates CHILD in TARGET and
 * conflicts; then an Edit in Meta asks C0's recovery to replay, which TARGET,
 * now held by C1, blocks.
 */
const blockedSequence = async () => {
  const control = new MemorySpaceBackendTestControl();
  const backend = new MemorySpaceBackend(
    META_ID,
    [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
    control,
  );
  const openSpaces = createOpenSpaces({
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: 'Meta',
    newId: countingIds(),
    history: recordingHistory(),
  });
  const meta = await openSpaces.open(META_ID);
  render(<OpenSpacesApplication spaces={openSpaces} initial={meta} />);

  control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
  const c0 = await act(() =>
    openSpaces.spaceResources.create({
      containingSpaceId: META_ID,
      mapId: MAP_ID,
      title: 'Target',
      position: { x: 240, y: 0 },
    }),
  );
  if (c0.kind !== 'completed') throw new Error('C0 did not install');
  await waitFor(() => expect(meta.session.getState().persistence.kind).toBe('rejected'));
  const targetId = targetOf(meta, c0.resourceId);

  const target = await act(() => openSpaces.embed(targetId));
  const targetWorking = target.session.getState().working;
  const targetMap = targetWorking.document.defaultMap;
  if (targetMap === undefined) throw new Error('TARGET has no Map');
  control.queueResult({
    kind: 'conflict',
    conflicts: [
      {
        spaceId: targetId,
        current: {
          snapshot: renamed(targetWorking, 'Target'),
          revision: 9n,
          exportedRevision: null,
        },
      },
    ],
  });
  await act(() =>
    openSpaces.spaceResources.create({
      containingSpaceId: targetId,
      mapId: targetMap,
      title: 'Child',
      position: { x: 300, y: 0 },
    }),
  );
  await waitFor(() => expect(target.session.getState().persistence.kind).toBe('conflicted'));

  act(() => {
    meta.session.submit(withNotesTitled(meta.session.getState().working, EDITED));
  });
  await waitFor(() =>
    expect(meta.session.getState().persistence).toMatchObject({ blocked: { spaceId: targetId } }),
  );
  return { control, backend, openSpaces, meta, targetId };
};

/**
 * The same block one level down, on a Space that can exit: C1 creates CHILD in
 * TARGET and is rejected; C2 creates a Space in CHILD and conflicts; then an
 * Edit in TARGET asks C1's recovery to replay, which CHILD, now held by C2,
 * blocks.
 */
const blockedTarget = async () => {
  const control = new MemorySpaceBackendTestControl();
  const backend = new MemorySpaceBackend(
    META_ID,
    [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
    control,
  );
  const openSpaces = createOpenSpaces({
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: 'Meta',
    newId: countingIds(),
    history: recordingHistory(),
  });
  const meta = await openSpaces.open(META_ID);
  render(<OpenSpacesApplication spaces={openSpaces} initial={meta} />);

  const createIn = async (containing: OpenSpace, title: string) => {
    const mapId = containing.session.getState().working.document.defaultMap;
    if (mapId === undefined) throw new Error(`${title}'s container has no Map`);
    const created = await act(() =>
      openSpaces.spaceResources.create({
        containingSpaceId: containing.id,
        mapId,
        title,
        position: { x: 240, y: 0 },
      }),
    );
    if (created.kind !== 'completed') throw new Error(`${title} did not install`);
    return targetOf(containing, created.resourceId);
  };

  const targetId = await createIn(meta, 'Target');
  await waitFor(() => expect(meta.session.getState().persistence.kind).toBe('settled'));
  const target = await act(() => openSpaces.embed(targetId));

  control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
  const childId = await createIn(target, 'Child');
  await waitFor(() => expect(target.session.getState().persistence.kind).toBe('rejected'));

  const child = await act(() => openSpaces.embed(childId));
  control.queueResult({
    kind: 'conflict',
    conflicts: [
      {
        spaceId: childId,
        current: {
          snapshot: renamed(child.session.getState().working, 'Child'),
          revision: 9n,
          exportedRevision: null,
        },
      },
    ],
  });
  await createIn(child, 'Grandchild');
  await waitFor(() => expect(child.session.getState().persistence.kind).toBe('conflicted'));

  act(() => {
    target.session.submit(renamed(target.session.getState().working, 'Target edited'));
  });
  await waitFor(() =>
    expect(target.session.getState().persistence).toMatchObject({
      kind: 'rejected',
      blocked: { spaceId: childId },
    }),
  );
  return { control, openSpaces, target, targetId };
};

const notice = () => screen.getByTestId('persistence-failure');

describe('A save another Space blocks', () => {
  // React Flow and Base UI measure, and jsdom has no `ResizeObserver`.
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

  it('names the blocking Space, reaches it, and saves the kept Edits only on Retry', async () => {
    const { control, openSpaces, meta, targetId } = await blockedSequence();

    expect(control.requests).toHaveLength(2);
    // The notice replaces the original rejection's dialog, and says what stands
    // in the way now rather than what the server said about C0.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(notice()).toHaveTextContent(
      'Target has a conflict to resolve before these changes can be saved.',
    );
    expect(notice()).not.toHaveTextContent('permission');
    expect(notesTitle(meta)).toBe(EDITED);

    fireEvent.click(within(notice()).getByRole('button', { name: 'Open Target' }));
    await waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(targetId));
    const conflict = await screen.findByRole('alertdialog');
    fireEvent.click(within(conflict).getByRole('button', { name: 'Reload' }));
    await waitFor(() =>
      expect(liveSession(openSpaces, targetId).getState().persistence.kind).toBe('settled'),
    );

    // Resolving the blocker sends nothing on Meta's behalf.
    expect(control.requests).toHaveLength(2);

    fireEvent.click(await screen.findByRole('button', { name: 'Go to Meta' }));
    await waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(META_ID));
    expect(notesTitle(meta)).toBe(EDITED);
    expect(control.requests).toHaveLength(2);

    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: targetId, revision: 10n },
      ],
      deletedSpaceIds: [],
    });
    fireEvent.click(within(notice()).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(meta.session.getState().persistence.kind).toBe('settled'));
    expect(control.requests).toHaveLength(3);
    const sent = control.requests[2]?.changes[0];
    expect(sent).toMatchObject({ kind: 'update', spaceId: META_ID });
    const sentNotes =
      sent?.kind === 'update'
        ? sent.snapshot.resources.find(({ id }) => id === RESOURCE_ID)?.document
        : undefined;
    expect(sentNotes).toEqual({ ...notes, title: EDITED });
    expect(screen.queryByTestId('persistence-failure')).toBeNull();
  });

  it('updates the reason when a Retry is refused, and keeps Retry and the Edits', async () => {
    const { control, backend, openSpaces, meta, targetId } = await blockedSequence();

    // Still blocked: a Retry now is refused again, by the same Space.
    fireEvent.click(within(notice()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(notice()).toHaveTextContent('Target has a conflict'));
    expect(control.requests).toHaveLength(2);

    act(() => {
      liveSession(openSpaces, targetId).acceptRemote();
    });
    const read = vi
      .spyOn(backend, 'loadAggregate')
      .mockRejectedValueOnce(new Error('aggregate read refused'));
    fireEvent.click(within(notice()).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(notice()).toHaveTextContent(
        'The stored Spaces could not be read, so these changes were not sent.',
      ),
    );
    expect(read).toHaveBeenCalled();
    expect(within(notice()).queryByRole('button', { name: 'Open Target' })).toBeNull();
    expect(within(notice()).getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(notesTitle(meta)).toBe(EDITED);
    expect(control.requests).toHaveLength(2);
  });

  it('refuses to exit a Space whose blocked save Retry can still make', async () => {
    const { control, openSpaces, target, targetId } = await blockedTarget();
    const requests = control.requests.length;

    await expect(openSpaces.exit(targetId)).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', recovery: 'retry' },
    });
    expect(openSpaces.entry(targetId)).toBe(target);
    expect(target.session.getState().working.document.title).toBe('Target edited');
    expect(control.requests).toHaveLength(requests);
  });
});
