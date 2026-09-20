import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ChromeContinuation } from '../src/components/ChromeContinuation';
import { composeApp, type ComposedApp } from '../src/compose-app';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [{ id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } }],
};

function open(): ComposedApp['continuation'] {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = MemorySpaceBackend.asMeta(loaded);
  const session = openSpaceSession(backend, loaded);
  return composeApp({ spaceSession: session, selection: MAP_ID }).continuation;
}

function Harness({
  continuation,
  chromeRenameReady,
  disabled,
  onPress,
  onLand,
}: {
  readonly continuation: ComposedApp['continuation'];
  readonly chromeRenameReady: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly onLand?: () => void;
}) {
  const within = useRef<HTMLDivElement>(null);
  return (
    <div ref={within}>
      <button
        type="button"
        data-continuation-control="map-name"
        aria-disabled={disabled ? 'true' : undefined}
        disabled={disabled}
        onClick={onPress}
      >
        Map
      </button>
      {onLand === undefined ? (
        <ChromeContinuation
          continuation={continuation}
          within={within}
          chromeRenameReady={chromeRenameReady}
        />
      ) : (
        <ChromeContinuation
          continuation={continuation}
          within={within}
          chromeRenameReady={chromeRenameReady}
          onLand={onLand}
        />
      )}
    </div>
  );
}

describe('ChromeContinuation', () => {
  it('waits for the created subject on the addressed rail without pressing the Dock', async () => {
    const continuation = open();
    let dockPressed = false;
    let railPressed = 0;
    const { getByText } = render(
      <Harness
        continuation={continuation}
        chromeRenameReady
        disabled={false}
        onPress={() => {
          dockPressed = true;
        }}
      />,
    );
    const dock = getByText('Map');
    const rail = document.createElement('button');
    rail.setAttribute('data-continuation-control', 'map-name');
    rail.setAttribute('data-continuation-scope', 'nested-rail');
    rail.setAttribute('data-continuation-subject', 'old-map');
    rail.addEventListener('click', () => {
      railPressed += 1;
    });
    dock.after(rail);
    act(() =>
      continuation.request({
        target: {
          kind: 'control',
          name: 'map-name',
          scope: { id: 'nested-rail', subject: 'created-map' },
        },
        select: false,
        then: 'rename',
      }),
    );
    expect(railPressed).toBe(0);
    expect(dockPressed).toBe(false);
    await act(async () => {
      rail.setAttribute('data-continuation-subject', 'created-map');
      await Promise.resolve();
    });
    expect(railPressed).toBe(1);
    expect(dockPressed).toBe(false);
    expect(continuation.getState().pending).toBeNull();
  });

  it('keeps a rename continuation owed while the control is withdrawn', () => {
    const continuation = open();
    let pressed = false;

    const { rerender } = render(
      <Harness
        continuation={continuation}
        chromeRenameReady={false}
        disabled
        onPress={() => {
          pressed = true;
        }}
      />,
    );

    act(() =>
      continuation.request({
        target: { kind: 'control', name: 'map-name' },
        select: false,
        then: 'rename',
      }),
    );

    expect(continuation.getState().pending).not.toBeNull();
    expect(pressed).toBe(false);

    rerender(
      <Harness
        continuation={continuation}
        chromeRenameReady
        disabled={false}
        onPress={() => {
          pressed = true;
        }}
      />,
    );

    expect(continuation.getState().pending).toBeNull();
    expect(pressed).toBe(true);
  });

  it('reports landing only after a rename press runs', () => {
    const continuation = open();
    let landed = false;

    render(
      <Harness
        continuation={continuation}
        chromeRenameReady
        disabled={false}
        onPress={() => undefined}
        onLand={() => {
          landed = true;
        }}
      />,
    );

    act(() =>
      continuation.request({
        target: { kind: 'control', name: 'map-name' },
        select: false,
        then: 'rename',
      }),
    );

    expect(landed).toBe(true);
    expect(continuation.getState().pending).toBeNull();
  });
});
