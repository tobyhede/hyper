import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { openStoredWorkspace } from '../src/open-workspace';
import { startApplication } from '../src/startup';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: { version: 2, title: 'Stored space', routes: [] },
  cards: [
    {
      id: CARD_ID,
      document: { title: 'Start here', kind: 'markdown', body: 'Stored body' },
    },
  ],
});

const otherSnapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: OTHER_SPACE_ID,
  document: { version: 2, title: 'Exact selected space', routes: [] },
  cards: [
    {
      id: OTHER_CARD_ID,
      document: { title: 'Only in selected space', kind: 'markdown', body: 'Selected body' },
    },
  ],
});

beforeAll(() => {
  vi.stubGlobal('scrollTo', () => undefined);
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

it('mounts an opened startup result', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const backend = new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]);
  const opened = await openStoredWorkspace(backend, SPACE_ID);

  try {
    await act(async () => {
      await startApplication(root, () => Promise.resolve({ kind: 'opened', opened }));
    });

    expect(within(container).getByRole('heading', { name: 'Stored space' })).toBeVisible();
    await waitFor(() => expect(container.querySelector('.react-flow')).toBeInTheDocument());
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('renders every database workspace title and UUID as an accessible choice', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const backend = new MemorySpaceBackend([
    { snapshot, revision: 0n, exportedRevision: null },
    { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
  ]);

  try {
    await act(async () => {
      await startApplication(
        root,
        () =>
          Promise.resolve({
            kind: 'selection',
            spaces: [
              { id: SPACE_ID, title: 'Architecture notes' },
              { id: OTHER_SPACE_ID, title: 'Release walkthrough' },
            ],
          }),
        (id) => openStoredWorkspace(backend, id),
      );
    });

    expect(
      within(container).getByRole('button', {
        name: `Architecture notes ${SPACE_ID}`,
      }),
    ).toBeVisible();
    expect(
      within(container).getByRole('button', {
        name: `Release walkthrough ${OTHER_SPACE_ID}`,
      }),
    ).toBeVisible();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('opens and mounts the exact workspace UUID chosen from the catalog', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const backend = new MemorySpaceBackend([
    { snapshot, revision: 0n, exportedRevision: null },
    { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
  ]);

  try {
    await act(async () => {
      await startApplication(
        root,
        () =>
          Promise.resolve({
            kind: 'selection',
            spaces: [
              { id: SPACE_ID, title: 'Stored space' },
              { id: OTHER_SPACE_ID, title: 'Exact selected space' },
            ],
          }),
        (id) => openStoredWorkspace(backend, id),
      );
    });

    fireEvent.click(
      within(container).getByRole('button', {
        name: `Exact selected space ${OTHER_SPACE_ID}`,
      }),
    );

    expect(
      await within(container).findByRole('heading', { name: 'Exact selected space' }),
    ).toBeVisible();
    expect(
      within(container).queryByRole('heading', { name: 'Stored space' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.react-flow')).toBeInTheDocument());
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('allows only one workspace selection to open at a time', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const backend = new MemorySpaceBackend([
    { snapshot, revision: 0n, exportedRevision: null },
    { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
  ]);
  let releaseFirstOpen = (): void => undefined;
  const firstOpenGate = new Promise<void>((resolve) => {
    releaseFirstOpen = resolve;
  });

  try {
    await act(async () => {
      await startApplication(
        root,
        () =>
          Promise.resolve({
            kind: 'selection',
            spaces: [
              { id: SPACE_ID, title: 'Stored space' },
              { id: OTHER_SPACE_ID, title: 'Exact selected space' },
            ],
          }),
        async (id) => {
          await firstOpenGate;
          return openStoredWorkspace(backend, id);
        },
      );
    });

    const firstChoice = within(container).getByRole('button', {
      name: `Stored space ${SPACE_ID}`,
    });
    const secondChoice = within(container).getByRole('button', {
      name: `Exact selected space ${OTHER_SPACE_ID}`,
    });

    act(() => {
      firstChoice.click();
      secondChoice.click();
    });

    expect(firstChoice).toBeDisabled();
    expect(secondChoice).toBeDisabled();

    await act(async () => {
      releaseFirstOpen();
      await firstOpenGate;
    });

    expect(await within(container).findByRole('heading', { name: 'Stored space' })).toBeVisible();
    expect(
      within(container).queryByRole('heading', { name: 'Exact selected space' }),
    ).not.toBeInTheDocument();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('renders the complete startup error when the chosen UUID has disappeared', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const backend = new MemorySpaceBackend([
    { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
  ]);

  try {
    await act(async () => {
      await startApplication(
        root,
        () =>
          Promise.resolve({
            kind: 'selection',
            spaces: [{ id: SPACE_ID, title: 'Disappeared space' }],
          }),
        (id) => openStoredWorkspace(backend, id),
      );
    });

    fireEvent.click(
      within(container).getByRole('button', {
        name: `Disappeared space ${SPACE_ID}`,
      }),
    );

    const alert = await within(container).findByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Application could not start' }),
    ).toBeVisible();
    expect(alert).toHaveTextContent('The space could not be opened.');
    expect(alert).toHaveTextContent(`The backend could not load space ${SPACE_ID}`);
    expect(
      within(container).queryByRole('heading', { name: 'Exact selected space' }),
    ).not.toBeInTheDocument();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('renders complete startup failure details instead of leaving an empty root', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      await startApplication(root, () =>
        Promise.reject(
          new Error(
            'The bundled space failed to import:\n  - version: Invalid literal value, expected 2',
          ),
        ),
      );
    });

    const alert = within(container).getByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Application could not start' }),
    ).toBeVisible();
    expect(alert).toHaveTextContent('The space could not be opened.');
    expect(alert).toHaveTextContent(
      'The bundled space failed to import: - version: Invalid literal value, expected 2',
    );
    expect(container.querySelector('.react-flow')).not.toBeInTheDocument();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
