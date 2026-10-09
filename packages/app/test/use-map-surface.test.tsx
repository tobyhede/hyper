import { StrictMode, useEffect, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { createMapSurface } from '../src/map-surface';
import { CANVAS } from '../src/space-authoring';
import { useMapSurface } from '../src/use-map-surface';
import { unusedImageSources } from './image-sources';

const id = (tail: string) => uuidSchema.parse(`00000000-0000-4000-8000-${tail.padStart(12, '0')}`);
const SPACE = id('1');
const RESOURCE = id('2');
const MAP = id('4');
const GRAPH = id('6');

function composition() {
  const snapshot: SpaceSnapshot = {
    id: SPACE,
    document: {
      version: 1,
      title: 'Titles',
      defaultMap: MAP,
      maps: [
        {
          id: MAP,
          title: 'Canvas',
          kind: 'positioned',
          positions: { [RESOURCE]: { x: 10, y: 20, open: false } },
          graphs: [{ id: GRAPH, title: 'Graph', edges: [] }],
        },
      ],
    },
    resources: [{ id: RESOURCE, document: { title: 'Resource 1', kind: 'markdown', body: '' } }],
  };
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  return composeApp({ spaceSession, images: unusedImageSources });
}

const strict = ({ children }: { readonly children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

describe('useMapSurface', () => {
  it('offers the title an Edit would mint, even when the Space changed before the drawing observed it', async () => {
    const app = composition();
    const surface = createMapSurface(app, () => ({
      kind: 'drawn',
      mapId: MAP,
      graphId: GRAPH,
      policy: 'authoring',
      occurrence: 'drawing',
    }));
    // The Space gains `Resource 2` after the drawing's snapshot was taken and
    // before anything observes it, as a drawn Map's first render can see.
    const created = app.authoring.complete(CANVAS, {
      kind: 'created-resource',
      resourceKind: 'markdown',
      anchor: { x: 0, y: 0 },
    });
    expect(created.kind).toBe('completed');
    await vi.waitFor(() =>
      expect(app.authoring.getState().session.persistence.kind).toBe('settled'),
    );
    expect(surface.authoring.getState().session.working.resources).toHaveLength(1);

    const { result } = renderHook(
      () => {
        useEffect(() => surface.observe(), []);
        return useMapSurface(app, surface, {
          presenting: false,
          spaceOnCanvas: true,
          creatingSpaceResource: false,
        });
      },
      { wrapper: strict },
    );
    await act(() => Promise.resolve());

    expect(result.current.newResourceTitle).toBe('Resource 3');
  });
});
