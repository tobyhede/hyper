import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SPACE_RESOURCE_MIN_OPEN_SIZE,
  spaceSnapshotSchema,
  uuidSchema,
  type ResourceId,
} from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { RESOURCE_SIZE } from '../src/resource';
import { authoringAvailability } from '../src/authoring-availability';
import { useCanvasResourceAuthoring } from '../src/canvas-resource-authoring';
import { composeApp } from '../src/compose-app';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import {
  NO_SPACE_RESOURCE_TARGETS,
  type SpaceResourceTargets,
} from '../src/space-resource-targets';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
/**
 * What the Space Resource selects of its target (ADR 0079). The target Space is not
 * in this fixture — these tests mount one canvas and never read a second Space —
 * so the pair is required by the shape and resolved by nothing here.
 */
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

const snapshot = spaceSnapshotSchema.parse({
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
          [RESOURCE_ID]: { x: 0, y: 0, open: false },
          [REFERENCE_ID]: { x: 300, y: 0, open: false },
          [SPACE_RESOURCE_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: REFERENCE_ID, document: { title: 'Return', kind: 'reference', target: RESOURCE_ID } },
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

const snapshotWithoutResource = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [],
});

const node = (
  open: boolean,
  resourceId = RESOURCE_ID,
  kind: 'markdown' | 'reference' | 'space' = 'markdown',
): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: { x: 0, y: 0 },
  width: open ? 640 : RESOURCE_SIZE.width,
  height: open ? 480 : RESOURCE_SIZE.height,
  data: {
    resourceId,
    title: 'A',
    readOnly: false,
    kind,
    body: 'A source',
    open,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: GRAPH_ID,
    activeGraphColor: '#8a94a6',
  },
});

interface HookProps {
  readonly open: boolean;
  readonly enabled: boolean;
  readonly presenting: boolean;
  readonly nameOnCreation: string | null;
  readonly resourceId: ResourceId;
}

const mountAuthoring = (
  onBodyEditingChange?: (editing: boolean) => void,
  projectedKind: 'markdown' | 'reference' | 'space' = 'markdown',
) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const { authoring, adapter } = composeApp({ spaceSession });
  const initialProps: HookProps = {
    open: false,
    enabled: true,
    presenting: false,
    nameOnCreation: null,
    resourceId: RESOURCE_ID,
  };
  const hook = renderHook(
    ({ open, enabled, presenting, nameOnCreation, resourceId }: HookProps) =>
      useCanvasResourceAuthoring({
        nodes: [node(open, resourceId, projectedKind)],
        // The two facts this hook's rules turn on, stated as facts and turned
        // into answers by the one module that owns them. A live chrome rename is
        // what `enabled: false` means here — it is the fact that takes canvas
        // authoring away, and it is deliberately not the fact that ends a live
        // content edit.
        availability: authoringAvailability({
          editable: true,
          presenting,
          editingResourceBody: false,
          editingResourceTitle: false,
          resourceIsOpen: false,
          editingChromeTitle: !enabled,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
          creatingSpaceResource: false,
        }),
        nameOnCreation,
        authoring,
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        onBodyEditingChange,
      }),
    {
      initialProps,
    },
  );
  return { ...hook, spaceSession, authoring, adapter };
};

const onlyNode = (nodes: readonly ResourceFlowNode[]): ResourceFlowNode => {
  const decorated = nodes[0];
  if (decorated === undefined) throw new Error('The Resource was not decorated.');
  return decorated;
};

describe('canvas Resource authoring', () => {
  it('authors Open before installing the body editor for Edit on a Closed Resource', () => {
    const { result, rerender, spaceSession } = mountAuthoring();

    const closed = onlyNode(result.current.nodes);
    expect(closed.data.bodyEditor).toBeUndefined();

    act(() => {
      expect(closed.data.onEditResource?.(true)).toBe('completed');
      closed.data.onBeginBodyEditing?.();
    });
    expect(spaceSession.getState().working.document.maps?.[0]?.positions[RESOURCE_ID]?.open).toBe(
      true,
    );
    expect(result.current.nodes[0]?.data.bodyEditor).toBeUndefined();

    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(result.current.nodes[0]?.data.bodyEditor).toBeDefined();
  });

  it('authors Open for a Reference Resource through the same Resource operation', () => {
    const { result, rerender, spaceSession } = mountAuthoring(undefined, 'reference');
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: REFERENCE_ID,
    });

    act(() => expect(result.current.openResource(REFERENCE_ID)).toBe('completed'));
    expect(spaceSession.getState().working.document.maps?.[0]?.positions[REFERENCE_ID]?.open).toBe(
      true,
    );

    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: REFERENCE_ID,
    });

    // Open and read-only are the two halves of ADR 0070, and this Reference Resource is in
    // the working Space, so nothing else is withholding these. Opening keeps
    // Close and the shared Title interaction; it never hands the Reference Resource the
    // caret or the editor that would let it author the Target's content.
    const reference = onlyNode(result.current.nodes);
    expect(reference.data.onEditResource).toBeDefined();
    expect(reference.data.onBeginTitleEditing).toBeDefined();
    expect(reference.data.onBeginBodyEditing).toBeUndefined();
    expect(reference.data.bodyEditor).toBeUndefined();
  });

  /**
   * `openResource` refuses on `authorOnCanvas`, so presenting withdraws it.
   *
   * Unreachable through today's two call sites, both of which are already
   * behind the same answer, which is exactly why it is pinned here: the
   * presenting chrome does reach this canvas (`connectOnCanvas` deliberately
   * survives a presentation), so a future caller Opening a Resource mid-traversal
   * would otherwise take a silent `'retained'` with nothing failing.
   */
  it('withholds Open while presenting, which authorOnCanvas withdraws', () => {
    const { result, rerender, spaceSession } = mountAuthoring();

    rerender({
      open: false,
      enabled: true,
      presenting: true,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });

    act(() => expect(result.current.openResource(RESOURCE_ID)).toBe('retained'));
    expect(
      spaceSession.getState().working.document.maps?.[0]?.positions[RESOURCE_ID]?.open,
    ).not.toBe(true);
  });

  it('forgets a title caret when canvas authoring is withdrawn', () => {
    const { result, rerender, spaceSession } = mountAuthoring();
    act(() => result.current.beginTitleEditing(RESOURCE_ID));
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    rerender({
      open: false,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();

    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
    act(() => expect(result.current.openResource(RESOURCE_ID)).toBe('completed'));
    expect(spaceSession.getState().working.document.maps?.[0]?.positions[RESOURCE_ID]?.open).toBe(
      true,
    );
  });

  it('keeps a live body editor when a modal withdraws canvas controls', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());

    rerender({
      open: true,
      enabled: false,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });

    const withdrawn = onlyNode(result.current.nodes);
    expect(withdrawn.data.bodyEditor).toBeDefined();
    expect(withdrawn.data.resize).toBeUndefined();
  });

  it('withholds competing Resource edits while a body caret is live', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());

    const editing = onlyNode(result.current.nodes);
    expect(editing.data.onBeginTitleEditing).toBeUndefined();
    expect(editing.data.onBeginBodyEditing).toBeUndefined();
  });

  it('temporarily hides a body editor while presenting without discarding its caret', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeDefined();

    rerender({
      open: true,
      enabled: true,
      presenting: true,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeUndefined();

    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeDefined();
  });

  /**
   * An Open Space Resource's floor is its own, and taller than every other Resource's.
   *
   * ADR 0068's embedded Map is painted over the Resource, so the Resource's own
   * passengers hold a fixed footer under a fixed rail and `.canvas-resource` hides
   * what will not fit. At the collapsed floor every other Resource resizes to, a
   * Space Resource's Graph selector is simply cut off — so the capability carries
   * `SPACE_RESOURCE_MIN_OPEN_SIZE`, which is the inset plus the smallest Resource the
   * embedded Map could hold.
   */
  it('allows a Space Resource resize to reach Close while flooring an ordinary Open proposal above its footer', () => {
    const { result, rerender, authoring, adapter, spaceSession } = mountAuthoring(
      undefined,
      'space',
    );
    act(() => {
      authoring.complete({ kind: 'opened-resource', resourceId: SPACE_RESOURCE_ID });
    });
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: SPACE_RESOURCE_ID,
    });

    const space = onlyNode(result.current.nodes);
    expect(space.data.resize?.minWidth).toBe(RESOURCE_SIZE.width);
    expect(space.data.resize?.minHeight).toBe(RESOURCE_SIZE.height);
    act(() => {
      space.data.resize?.onResizeStart();
      space.data.resize?.onResize({ width: 280, height: 220 });
    });
    expect(adapter.getState().resizeDraft?.size).toEqual(SPACE_RESOURCE_MIN_OPEN_SIZE);
    const remembered =
      spaceSession.getState().working.document.maps?.[0]?.positions[SPACE_RESOURCE_ID];
    act(() => {
      space.data.resize?.onResize(RESOURCE_SIZE);
      space.data.resize?.onResizeEnd();
    });
    expect(
      spaceSession.getState().working.document.maps?.[0]?.positions[SPACE_RESOURCE_ID],
    ).toEqual({
      ...remembered,
      open: false,
    });
  });

  it.each(['markdown', 'reference'] as const)(
    'floors an Open %s Resource resize at the collapsed size',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        open: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        resourceId: kind === 'reference' ? REFERENCE_ID : RESOURCE_ID,
      });

      const resource = onlyNode(result.current.nodes);
      expect(resource.data.resize?.minWidth).toBe(RESOURCE_SIZE.width);
      expect(resource.data.resize?.minHeight).toBe(RESOURCE_SIZE.height);
    },
  );

  it.each(['markdown', 'reference'] as const)(
    'withholds every authoring control from a projected %s Resource absent from the working Space',
    (kind) => {
      const { result, rerender } = mountAuthoring(undefined, kind);
      rerender({
        open: true,
        enabled: true,
        presenting: false,
        nameOnCreation: null,
        resourceId: MISSING_RESOURCE_ID,
      });
      act(() => result.current.beginTitleEditing(MISSING_RESOURCE_ID));

      const missing = onlyNode(result.current.nodes);
      expect(missing.data.onEditResource).toBeUndefined();
      expect(missing.data.onBeginTitleEditing).toBeUndefined();
      expect(missing.data.onBeginBodyEditing).toBeUndefined();
      expect(missing.data.resize).toBeUndefined();
      expect(missing.data.titleEditor).toBeUndefined();
      expect(missing.data.bodyEditor).toBeUndefined();
    },
  );

  it('withdraws authoring when the working Space changes without a projection render', () => {
    const { result, spaceSession } = mountAuthoring();
    expect(onlyNode(result.current.nodes).data.onEditResource).toBeDefined();

    act(() => spaceSession.submit(snapshotWithoutResource));

    const staleProjection = onlyNode(result.current.nodes);
    expect(staleProjection.data.onEditResource).toBeUndefined();
    expect(staleProjection.data.onBeginTitleEditing).toBeUndefined();
  });

  it('forgets an observed body caret when the Resource stops being Open', () => {
    const bodyEditingChanged = vi.fn();
    const { result, rerender } = mountAuthoring(bodyEditingChanged);
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    expect(bodyEditingChanged).toHaveBeenLastCalledWith(true);

    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });

    expect(onlyNode(result.current.nodes).data.bodyEditor).toBeUndefined();
    expect(bodyEditingChanged).toHaveBeenLastCalledWith(false);
  });

  it('opens title editing only when a newly created Resource identity changes', () => {
    const { result, rerender } = mountAuthoring();
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: RESOURCE_ID,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeDefined();

    act(() => onlyNode(result.current.nodes).data.titleEditor?.onCancel());
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: RESOURCE_ID,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.titleEditor).toBeUndefined();
  });
});

describe('canvas Resource authoring Space rail', () => {
  const target: SpaceResourceTarget = {
    id: TARGET_SPACE_ID,
    title: 'Architecture',
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Collection 1',
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview', color: '#1f77b4' }],
      },
    ],
  };

  const spaceNode = (open: boolean, readOnly = false): ResourceFlowNode => ({
    ...node(open, SPACE_RESOURCE_ID, 'space'),
    data: { ...node(open, SPACE_RESOURCE_ID, 'space').data, readOnly },
  });

  const mountRail = (open: boolean, withTarget: boolean, readOnly = false, enabled = true) => {
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter } = composeApp({ spaceSession });
    return renderHook(() =>
      useCanvasResourceAuthoring({
        nodes: [spaceNode(open, readOnly)],
        availability: authoringAvailability({
          editable: true,
          presenting: false,
          editingResourceBody: false,
          editingResourceTitle: false,
          resourceIsOpen: false,
          editingChromeTitle: !enabled,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
          creatingSpaceResource: false,
        }),
        nameOnCreation: null,
        authoring,
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        spaceResourceTargets: withTarget ? new Map([[TARGET_SPACE_ID, target]]) : undefined,
      }),
    );
  };

  it('omits the rail while closed even when the target is read', () => {
    const { result } = mountRail(false, true);
    expect(onlyNode(result.current.nodes).data.spaceRail).toBeUndefined();
    expect(onlyNode(result.current.nodes).data.portal).toBeUndefined();
  });

  it('omits the rail while the target is unread', () => {
    const { result } = mountRail(true, false);
    expect(onlyNode(result.current.nodes).data.spaceRail).toBeUndefined();
  });

  it('omits the rail on a read-only Resource', () => {
    const { result } = mountRail(true, true, true);
    expect(onlyNode(result.current.nodes).data.spaceRail).toBeUndefined();
  });

  it('builds the rail for an Open Space Resource whose target is read', () => {
    const { result } = mountRail(true, true);
    expect(onlyNode(result.current.nodes).data.spaceRail).toBeDefined();
  });

  it('still draws a disabled rail when canvas authoring is withdrawn', () => {
    const { result } = mountRail(true, true, false, false);
    expect(onlyNode(result.current.nodes).data.spaceRail).toBeDefined();
  });
});

describe('canvas Resource authoring decoration identity', () => {
  const markdownNode = node(false, RESOURCE_ID, 'markdown');
  const referenceNode = node(false, REFERENCE_ID, 'reference');
  const space = node(true, SPACE_RESOURCE_ID, 'space');
  const projection = [markdownNode, referenceNode, space];
  const target: SpaceResourceTarget = {
    id: TARGET_SPACE_ID,
    title: 'Architecture',
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Collection 1',
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview', color: '#1f77b4' }],
      },
    ],
  };

  interface IdentityProps {
    readonly spaceResourceTargets: SpaceResourceTargets;
    readonly portalEditing: ReadonlySet<ResourceId>;
  }

  const dataOf = (nodes: readonly ResourceFlowNode[], resourceId: ResourceId) => {
    const found = nodes.find((candidate) => candidate.data.resourceId === resourceId);
    if (found === undefined) throw new Error('The Resource was not decorated.');
    return found.data;
  };

  const editedBodySnapshot = () =>
    spaceSnapshotSchema.parse({
      id: snapshot.id,
      document: snapshot.document,
      resources: [
        { id: RESOURCE_ID, document: { title: 'A', kind: 'markdown', body: 'Edited source' } },
        { id: REFERENCE_ID, document: { title: 'Return', kind: 'reference', target: RESOURCE_ID } },
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Architecture',
            kind: 'space',
            spaceId: TARGET_SPACE_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
    });

  const mountIdentity = () => {
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter } = composeApp({ spaceSession });
    const onSelectResource = () => undefined;
    const onPortalEditingChange = () => undefined;
    const resourceResize = adapter.getState().resourceResize;
    const hook = renderHook(
      ({ spaceResourceTargets, portalEditing }: IdentityProps) =>
        useCanvasResourceAuthoring({
          nodes: projection,
          availability: authoringAvailability({
            editable: true,
            presenting: false,
            editingResourceBody: false,
            editingResourceTitle: false,
            resourceIsOpen: false,
            editingChromeTitle: false,
            spaceOnCanvas: true,
            editingEmbeddedMap: false,
            creatingSpaceResource: false,
          }),
          nameOnCreation: null,
          authoring,
          spaceSession,
          resourceResize,
          onSelectResource,
          spaceResourceTargets,
          portalEditing,
          onPortalEditingChange,
        }),
      {
        initialProps: {
          spaceResourceTargets: NO_SPACE_RESOURCE_TARGETS,
          portalEditing: new Set<ResourceId>(),
        },
      },
    );
    return { ...hook, spaceSession };
  };

  it('keeps markdown and Reference Resource node.data when only Space Resource targets change', () => {
    const { result, rerender } = mountIdentity();
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);
    const referenceData = dataOf(result.current.nodes, REFERENCE_ID);

    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, REFERENCE_ID)).toBe(referenceData);
    expect(dataOf(result.current.nodes, SPACE_RESOURCE_ID).spaceRail).toBeDefined();
  });

  it('keeps markdown node.data when only portal editing changes', () => {
    const { result, rerender } = mountIdentity();
    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);

    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set([SPACE_RESOURCE_ID]),
    });

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, SPACE_RESOURCE_ID).portal?.editing).toBe(true);
  });

  it('keeps markdown and Reference Resource node.data when a body save does not change Resource membership', () => {
    const { result, spaceSession } = mountIdentity();
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);
    const referenceData = dataOf(result.current.nodes, REFERENCE_ID);

    act(() => spaceSession.submit(editedBodySnapshot()));

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, REFERENCE_ID)).toBe(referenceData);
  });

  it('keeps an Open Space Resource node.data when a markdown body save does not change its document', () => {
    const { result, rerender, spaceSession } = mountIdentity();
    rerender({
      spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
      portalEditing: new Set<ResourceId>(),
    });
    const markdownData = dataOf(result.current.nodes, RESOURCE_ID);
    const spaceData = dataOf(result.current.nodes, SPACE_RESOURCE_ID);
    expect(spaceData.spaceRail).toBeDefined();

    act(() => spaceSession.submit(editedBodySnapshot()));

    expect(dataOf(result.current.nodes, RESOURCE_ID)).toBe(markdownData);
    expect(dataOf(result.current.nodes, SPACE_RESOURCE_ID)).toBe(spaceData);
  });
});
