import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ChromeContinuation } from '../src/components/ChromeContinuation';
import { composeApp, type ComposedApp } from '../src/compose-app';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [THING_A]: { x: 10, y: 20, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [{ id: THING_A, document: { title: 'A', kind: 'markdown', body: 'A' } }],
};

function open(): ComposedApp['continuation'] {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([loaded]);
  const session = openSpaceSession(backend, loaded);
  return composeApp({
    spaceSession: session,
    selection: DIAGRAM_ID,
    initialPlacement: Placement.fromEntries([[THING_A, { x: 10, y: 20, open: false }]]),
  }).continuation;
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
        data-continuation-control="diagram-name"
        aria-disabled={disabled ? 'true' : undefined}
        disabled={disabled}
        onClick={onPress}
      >
        Diagram
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
        target: { kind: 'control', name: 'diagram-name' },
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
        target: { kind: 'control', name: 'diagram-name' },
        select: false,
        then: 'rename',
      }),
    );

    expect(landed).toBe(true);
    expect(continuation.getState().pending).toBeNull();
  });
});
