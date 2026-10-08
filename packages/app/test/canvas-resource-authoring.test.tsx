import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type ResourceId } from '@project/core';
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
import { fixtureDisplay, fixtureFacts } from './render-adapter-fixtures';
import type { ImageSources } from '../src/image-creation';
import { heldImageSources, unusedImageSources } from './image-sources';
import { CANVAS } from '../src/space-authoring';
import { canvasAuthoring } from './canvas-authoring';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const UR_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
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
          [UR_ID]: { x: 900, y: 0, open: false },
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
    { id: UR_ID, document: { title: 'Gateway', kind: 'ur' } },
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
  kind: 'markdown' | 'reference' | 'space' | 'ur' = 'markdown',
): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: { x: 0, y: 0 },
  width: open ? 640 : RESOURCE_SIZE.width,
  height: open ? 480 : RESOURCE_SIZE.height,
  data: {
    shape: 'rectangle',
    resourceId,
    title: 'A',
    readOnly: false,
    kind,
    ...fixtureFacts(kind),
    open,
    selectedForAuthoring: false,
    display: fixtureDisplay(open, kind, 'A source'),
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
  projectedKind: 'markdown' | 'reference' | 'space' | 'ur' = 'markdown',
  reportsOutcomes = false,
) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const { authoring, adapter, imageReplacement, commandOutcomes } = composeApp({
    images: unusedImageSources,
    spaceSession,
  });
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
        imageReplacement,
        nodes: [node(open, resourceId, projectedKind)],
        // The two facts this hook's rules turn on, stated as facts and turned
        // into answers by the one module that owns them. A live chrome rename is
        // what `enabled: false` means here — it is the fact that takes canvas
        // authoring away, and it is deliberately not the fact that ends a live
        // content edit.
        availability: authoringAvailability({
          editable: true,
          replacingImage: false,
          presenting,
          editingResourceBody: false,
          editingResourceTitle: false,
          editingChromeTitle: !enabled,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
          creatingSpaceResource: false,
        }),
        nameOnCreation,
        authoring: canvasAuthoring(authoring),
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        onBodyEditingChange,
        commandOutcomes: reportsOutcomes ? commandOutcomes : undefined,
      }),
    {
      initialProps,
    },
  );
  return { ...hook, spaceSession, authoring, adapter, commandOutcomes };
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
    expect(closed.data.display.shown).not.toBe('editing');

    act(() => {
      expect(closed.data.onOpenChange?.(true)).toBe('completed');
      closed.data.onBeginBodyEditing?.();
    });
    expect(spaceSession.getState().working.document.maps?.[0]?.positions[RESOURCE_ID]?.open).toBe(
      true,
    );
    expect(result.current.nodes[0]?.data.display.shown).not.toBe('editing');

    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(result.current.nodes[0]?.data.display.shown).toBe('editing');
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
    expect(reference.data.onOpenChange).toBeDefined();
    expect(reference.data.onBeginTitleEditing).toBeDefined();
    expect(reference.data.onBeginBodyEditing).toBeUndefined();
    expect(reference.data.display.shown).not.toBe('editing');
  });

  /**
   * An Ur Resource has no content (ADR 0113): it Opens through the one Resource
   * operation and keeps Close and its Title, and nothing hands it a caret or an
   * editor.
   */
  it('offers an Ur Resource no Open, Close or content edit, and Opens nothing for it', () => {
    const { result, rerender, spaceSession } = mountAuthoring(undefined, 'ur');
    rerender({
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: UR_ID,
    });
    const ur = onlyNode(result.current.nodes);
    expect(ur.data.onOpenChange).toBeUndefined();
    expect(ur.data.onBeginTitleEditing).toBeDefined();
    expect(ur.data.onBeginBodyEditing).toBeUndefined();
    const before = spaceSession.getState().working;

    act(() => expect(result.current.openResource(UR_ID)).toBe('retained'));
    expect(spaceSession.getState().working).toBe(before);
  });

  /**
   * An Ur Resource's Shape is chosen on its rail (ADR 0121): one Edit on the
   * Map, offered only where a refusal can be reported.
   */
  it('changes an Ur Resource’s Shape on its Map, and offers no choice without command outcomes', () => {
    const resourceShapeOf = (spaceSession: ReturnType<typeof mountAuthoring>['spaceSession']) =>
      spaceSession.getState().working.document.maps?.[0]?.positions[UR_ID]?.shape;
    const props = {
      open: false,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: UR_ID,
    };

    const silent = mountAuthoring(undefined, 'ur');
    silent.rerender(props);
    expect(onlyNode(silent.result.current.nodes).data.onResourceShapeChange).toBeUndefined();
    silent.unmount();

    const { result, rerender, spaceSession } = mountAuthoring(undefined, 'ur', true);
    rerender(props);
    act(() => onlyNode(result.current.nodes).data.onResourceShapeChange?.('diamond'));
    expect(resourceShapeOf(spaceSession)).toBe('diamond');

    rerender({ ...props, open: true });
    act(() => onlyNode(result.current.nodes).data.onResourceShapeChange?.('ellipse'));
    expect(resourceShapeOf(spaceSession)).toBe('ellipse');
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
    expect(withdrawn.data.display.shown).toBe('editing');
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
    expect(onlyNode(result.current.nodes).data.display.shown).toBe('editing');

    rerender({
      open: true,
      enabled: true,
      presenting: true,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.display.shown).not.toBe('editing');

    rerender({
      open: true,
      enabled: true,
      presenting: false,
      nameOnCreation: null,
      resourceId: RESOURCE_ID,
    });
    expect(onlyNode(result.current.nodes).data.display.shown).toBe('editing');
  });

  /**
   * The Closed Size is the one floor for every kind, a Space Resource's
   * embedded Map included: its content fits the rect it is given.
   */
  it('floors a Space Resource resize at the Closed Size and keeps it Open there', () => {
    const { result, rerender, authoring, adapter, spaceSession } = mountAuthoring(
      undefined,
      'space',
    );
    act(() => {
      authoring.complete(CANVAS, { kind: 'opened-resource', resourceId: SPACE_RESOURCE_ID });
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
    expect(adapter.getState().resizeDraft?.size).toEqual({ width: 280, height: 220 });
    act(() => space.data.resize?.onResizeEnd());
    expect(
      spaceSession.getState().working.document.maps?.[0]?.positions[SPACE_RESOURCE_ID],
    ).toMatchObject({ open: true, size: { width: 280, height: 220 } });
    act(() => {
      space.data.resize?.onResizeStart();
      space.data.resize?.onResize({ width: 100, height: 100 });
      space.data.resize?.onResizeEnd();
    });
    expect(
      spaceSession.getState().working.document.maps?.[0]?.positions[SPACE_RESOURCE_ID],
    ).toMatchObject({ open: true, size: RESOURCE_SIZE });
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
      expect(missing.data.onOpenChange).toBeUndefined();
      expect(missing.data.onBeginTitleEditing).toBeUndefined();
      expect(missing.data.onBeginBodyEditing).toBeUndefined();
      expect(missing.data.resize).toBeUndefined();
      expect(missing.data.titleEditor).toBeUndefined();
      expect(missing.data.display.shown).not.toBe('editing');
    },
  );

  it('withdraws authoring when the working Space changes without a projection render', () => {
    const { result, spaceSession } = mountAuthoring();
    expect(onlyNode(result.current.nodes).data.onOpenChange).toBeDefined();

    act(() => spaceSession.submit(snapshotWithoutResource));

    const staleProjection = onlyNode(result.current.nodes);
    expect(staleProjection.data.onOpenChange).toBeUndefined();
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

    expect(onlyNode(result.current.nodes).data.display.shown).not.toBe('editing');
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
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview', color: '#1f77b4', headShape: 'arrow' }],
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
    const { authoring, adapter, imageReplacement } = composeApp({
      images: unusedImageSources,
      spaceSession,
    });
    return renderHook(() =>
      useCanvasResourceAuthoring({
        imageReplacement,
        nodes: [spaceNode(open, readOnly)],
        availability: authoringAvailability({
          editable: true,
          replacingImage: false,
          presenting: false,
          editingResourceBody: false,
          editingResourceTitle: false,
          editingChromeTitle: !enabled,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
          creatingSpaceResource: false,
        }),
        nameOnCreation: null,
        authoring: canvasAuthoring(authoring),
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
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview', color: '#1f77b4', headShape: 'arrow' }],
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
        { id: UR_ID, document: { title: 'Gateway', kind: 'ur' } },
      ],
    });

  const mountIdentity = () => {
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter, imageReplacement } = composeApp({
      images: unusedImageSources,
      spaceSession,
    });
    const surfaceAuthoring = canvasAuthoring(authoring);
    const onSelectResource = () => undefined;
    const onPortalEditingChange = () => undefined;
    const resourceResize = adapter.getState().resourceResize;
    const hook = renderHook(
      ({ spaceResourceTargets, portalEditing }: IdentityProps) =>
        useCanvasResourceAuthoring({
          imageReplacement,
          nodes: projection,
          availability: authoringAvailability({
            editable: true,
            replacingImage: false,
            presenting: false,
            editingResourceBody: false,
            editingResourceTitle: false,
            editingChromeTitle: false,
            spaceOnCanvas: true,
            editingEmbeddedMap: false,
            creatingSpaceResource: false,
          }),
          nameOnCreation: null,
          authoring: surfaceAuthoring,
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

describe('canvas Resource authoring, replacing an image', () => {
  const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
  const OLD_URL = 'https://example.com/old.png';
  const withImage = spaceSnapshotSchema.parse({
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
            [IMAGE_ID]: { x: 0, y: 0, open: true, size: { width: 640, height: 480 } },
          },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultMap: MAP_ID,
    },
    resources: [{ id: IMAGE_ID, document: { title: 'Figure', kind: 'image', url: OLD_URL } }],
  });
  const imageNode: ResourceFlowNode = {
    id: IMAGE_ID,
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 640,
    height: 480,
    data: {
      shape: 'rectangle',
      resourceId: IMAGE_ID,
      title: 'Figure',
      readOnly: false,
      kind: 'image',
      ...fixtureFacts('image'),
      open: true,
      selectedForAuthoring: false,
      display: {
        shown: 'open',
        content: { kind: 'image', url: OLD_URL, via: 'self' },
      },
      activeGraphId: GRAPH_ID,
      activeGraphColor: '#8a94a6',
    },
  };
  /** The replacer an Image Resource's `replacing` display carries, absent at rest. */
  const replacerOf = (drawn: ResourceFlowNode) =>
    drawn.data.display.shown === 'replacing' ? drawn.data.display.replacer : undefined;
  /**
   * The hook over a composed Space whose image replacements store and measure
   * through `images`. What a replacement does is the replacement module's
   * (`image-replacement.test.ts`); these prove only what the canvas draws and says.
   */
  const mountImage = (images: ImageSources = unusedImageSources) => {
    const loaded = { snapshot: withImage, revision: 0n, exportedRevision: null };
    const spaceSession = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, adapter, imageReplacement } = composeApp({
      images,
      spaceSession,
      reportObserverError: vi.fn(),
    });
    const hook = renderHook(() =>
      useCanvasResourceAuthoring({
        nodes: [imageNode],
        availability: authoringAvailability({
          editable: true,
          replacingImage: false,
          presenting: false,
          editingResourceBody: false,
          editingResourceTitle: false,
          editingChromeTitle: false,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
          creatingSpaceResource: false,
        }),
        nameOnCreation: null,
        authoring: canvasAuthoring(authoring),
        spaceSession,
        resourceResize: adapter.getState().resourceResize,
        onSelectResource: () => undefined,
        imageReplacement,
      }),
    );
    return { ...hook, spaceSession };
  };

  it('installs the upload target when Replace begins on an Open Image Resource', () => {
    const { result } = mountImage();

    expect(replacerOf(onlyNode(result.current.nodes))).toBeUndefined();
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());

    expect(replacerOf(onlyNode(result.current.nodes))).toBeDefined();
    expect(result.current.bodyEditing).toBe(true);
  });

  it('says a broken upload in the target and keeps the target open', async () => {
    const { result, spaceSession } = mountImage();
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    const before = spaceSession.getState().working;

    await act(async () => {
      await expect(
        replacerOf(onlyNode(result.current.nodes))?.onReplace({
          kind: 'files',
          files: [new File(['bytes'], 'figure.png', { type: 'image/png' })],
        }),
      ).resolves.toBe('This image was not replaced: No image store is reachable.');
    });
    expect(spaceSession.getState().working).toBe(before);
    expect(result.current.bodyEditing).toBe(true);
  });

  it('says another replacement is still running in the target, keeping it open', async () => {
    const held = heldImageSources();
    const { result } = mountImage(held.images);
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    const replacer = replacerOf(onlyNode(result.current.nodes));

    let first: Promise<string | null> | undefined;
    await act(async () => {
      first = replacer?.onReplace({ kind: 'url', url: 'https://example.com/first.png' });
      await expect(
        replacer?.onReplace({ kind: 'url', url: 'https://example.com/second.png' }),
      ).resolves.toBe('Another image is still being replaced.');
    });
    expect(result.current.bodyEditing).toBe(true);

    held.release();
    await act(async () => {
      await expect(first).resolves.toBeNull();
    });
  });

  it('replaces the image from the target in one Edit, and says a refusal in the application’s words', async () => {
    const { result, spaceSession } = mountImage();
    act(() => onlyNode(result.current.nodes).data.onBeginBodyEditing?.());
    const replacer = replacerOf(onlyNode(result.current.nodes));

    let refused: string | null | undefined;
    let replaced: string | null | undefined;
    await act(async () => {
      refused = await replacer?.onReplace({ kind: 'url', url: 'data:image/png;base64,AAAA' });
      replaced = await replacer?.onReplace({ kind: 'url', url: 'https://example.com/new.png' });
    });
    expect(refused).toBe('An image URL must start with https: or http:.');
    expect(replaced).toBeNull();

    expect(spaceSession.getState().working.resources[0]?.document).toEqual({
      title: 'Figure',
      kind: 'image',
      url: 'https://example.com/new.png',
    });
    act(() => replacer?.onEnd());
    expect(replacerOf(onlyNode(result.current.nodes))).toBeUndefined();
  });
});
