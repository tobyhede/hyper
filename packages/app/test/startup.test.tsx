import { act, waitFor, within } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { newUuid, spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { createStoredSpaceOpener } from '../src/open-space';
import { startApplication } from '../src/startup';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: { version: 1, title: 'Stored space' },
  cards: [
    {
      id: CARD_ID,
      document: { title: 'Start here', kind: 'markdown', body: 'Stored body' },
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

it('mounts an opened startup result without interpreting the browser path again', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const backend = new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]);
  const opened = await createStoredSpaceOpener(backend, newUuid)(SPACE_ID);
  window.history.replaceState(null, '', '/already-resolved-by-startup');

  try {
    await act(async () => {
      await startApplication(root, () => Promise.resolve({ kind: 'opened', opened }));
    });

    expect(within(container).getByRole('heading', { name: 'Stored space' })).toBeVisible();
    await waitFor(() => expect(container.querySelector('.react-flow')).toBeInTheDocument());
  } finally {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, '', '/');
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
            'The bundled space failed to import:\n' +
              '  - Space document version 2 is not supported; this build reads version 1',
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
      'The bundled space failed to import: - Space document version 2 is not supported; this build reads version 1',
    );
    expect(container.querySelector('.react-flow')).not.toBeInTheDocument();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
