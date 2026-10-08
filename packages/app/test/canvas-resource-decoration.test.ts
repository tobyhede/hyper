import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ResourceId, type SpaceSnapshot } from '@project/core';
import {
  bareKindData,
  isResourceNodeOf,
  projectResourceNodes,
  type ResourceFlowNode,
  type ResourceFlowNodeOf,
} from '@project/react-flow-adapter';
import { loadSpaceSnapshot } from '@project/graph';
import {
  decorateImageResourceNode,
  decorateMarkdownResourceNode,
  decorateSharedResourceNode,
  decorateSpaceResourceNode,
  decorateUrResourceNode,
  type CanvasResourceDecorationContext,
} from '../src/canvas-resource-decoration';
import { RESOURCE_SIZE } from '../src/resource';
import { NO_SPACE_RESOURCE_TARGETS } from '../src/space-resource-targets';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import { fixtureDisplay, fixtureFacts } from './render-adapter-fixtures';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const UR_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');

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

const projectionNode = (
  resourceId: ResourceId,
  kind: 'markdown' | 'reference' | 'space' | 'ur',
  open = false,
  readOnly = false,
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
    readOnly,
    ...bareKindData(kind),
    ...fixtureFacts(kind),
    open,
    selectedForAuthoring: false,
    display: fixtureDisplay(open, kind),
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
  },
});

/** `node`, narrowed to the kind a kind's decoration takes. */
function ofKind<K extends ResourceFlowNode['data']['kind']>(
  node: ResourceFlowNode,
  kind: K,
): ResourceFlowNodeOf<K> {
  if (!isResourceNodeOf(node, kind)) throw new Error(`${node.id} is not a ${kind} Resource`);
  return node;
}

const spaceDocument = {
  title: 'Architecture',
  kind: 'space' as const,
  spaceId: TARGET_SPACE_ID,
  map: TARGET_MAP_ID,
  graph: TARGET_GRAPH_ID,
};

const context = (
  overrides: Partial<CanvasResourceDecorationContext> = {},
): CanvasResourceDecorationContext => ({
  authorOnCanvas: true,
  bodyEditing: false,
  imageAccept: 'image/png',
  replaceResourceImage: () => Promise.resolve(null),
  editableResourceIds: new Set([RESOURCE_ID, REFERENCE_ID, SPACE_RESOURCE_ID, UR_ID]),
  openResource: () => 'completed',
  closeResource: () => 'completed',
  beginTitleEditing: () => undefined,
  onSelectResource: () => undefined,
  resourceResize: {
    beginResize: () => undefined,
    previewResize: () => undefined,
    finishResize: () => undefined,
    cancelResize: () => undefined,
  },
  editingTitleResourceId: null,
  completeResourceTitle: () => null,
  clearCaret: () => undefined,
  beginBodyEditing: () => undefined,
  bodyEditorResourceId: null,
  completeResourceBody: () => 'completed',
  containingSpaceId: SPACE_ID,
  spaceDocuments: new Map([[SPACE_RESOURCE_ID, spaceDocument]]),
  spaceResourceTargets: new Map([[TARGET_SPACE_ID, target]]),
  spaces: null,
  commandOutcomes: undefined,
  deleteConfirmation: undefined,
  completeSpaceResourceSelection: () => null,
  portalEditing: undefined,
  onPortalEditingChange: undefined,
  contextNotices: new Map(),
  onContextEditingChange: () => undefined,
  onContextReport: () => undefined,
  ...overrides,
});

describe('decorateSharedResourceNode', () => {
  it('offers Open, title editing and entity actions on a Resource of the working Space', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'markdown'),
      context({ resourceEntityActions: () => [] }),
    );
    expect(patch.onOpenChange).toBeTypeOf('function');
    expect(patch.onBeginTitleEditing).toBeTypeOf('function');
    expect(patch.entityActions).toEqual([]);
  });

  /** The menu carries Connect, so this gate also gates drawing an Edge from the keyboard. */
  it('asks for entity actions only where authoring is on and the Resource is the working Space’s', () => {
    const groups = [[]];
    const resourceEntityActions = vi.fn(() => groups);

    expect(
      decorateSharedResourceNode(
        projectionNode(RESOURCE_ID, 'markdown'),
        context({ resourceEntityActions }),
      ).entityActions,
    ).toBe(groups);
    expect(resourceEntityActions).toHaveBeenCalledWith(RESOURCE_ID);
    expect(
      decorateSharedResourceNode(
        projectionNode(RESOURCE_ID, 'markdown'),
        context({ resourceEntityActions, authorOnCanvas: false }),
      ).entityActions,
    ).toEqual([]);
    expect(
      decorateSharedResourceNode(
        projectionNode(MISSING_RESOURCE_ID, 'markdown'),
        context({ resourceEntityActions }),
      ).entityActions,
    ).toBeUndefined();
    expect(resourceEntityActions).toHaveBeenCalledOnce();
  });

  it('withholds competing title controls while a body caret is live', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'markdown', true),
      context({ bodyEditing: true }),
    );
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.onOpenChange).toBeTypeOf('function');
  });

  it('keeps the live content editor’s Close drawn, and inert, while authoring is withdrawn', () => {
    const openResource = vi.fn(() => 'completed' as const);
    const closeResource = vi.fn(() => 'completed' as const);
    const withdrawn = context({
      authorOnCanvas: false,
      bodyEditing: true,
      bodyEditorResourceId: RESOURCE_ID,
      openResource,
      closeResource,
      resourceEntityActions: () => [[]],
    });

    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'markdown', true),
      withdrawn,
    );
    expect(patch.onOpenChange).toBeTypeOf('function');
    expect(patch.onOpenChange?.(false)).toBe('retained');
    expect(patch.onOpenChange?.(true)).toBe('retained');
    expect(closeResource).not.toHaveBeenCalled();
    expect(openResource).not.toHaveBeenCalled();
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.resize).toBeUndefined();
    expect(patch.titleEditor).toBeUndefined();
    expect(patch.entityActions).toEqual([]);

    expect(
      decorateSharedResourceNode(projectionNode(REFERENCE_ID, 'markdown', true), withdrawn)
        .onOpenChange,
    ).toBeUndefined();
  });

  it('withholds every authoring control from a projected Resource absent from the working Space', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(MISSING_RESOURCE_ID, 'markdown', true),
      context(),
    );
    expect(patch.onOpenChange).toBeUndefined();
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.resize).toBeUndefined();
    expect(patch.titleEditor).toBeUndefined();
    expect(patch.entityActions).toBeUndefined();
  });

  it('floors a projected Reference to a Space Resource at the Closed Size, as every kind', () => {
    const loaded = loadSpaceSnapshot({
      id: SPACE_ID,
      document: { version: 1, title: 'Host', maps: [] },
      resources: [
        { id: SPACE_RESOURCE_ID, document: spaceDocument },
        {
          id: REFERENCE_ID,
          document: { title: 'Reference', kind: 'reference', target: SPACE_RESOURCE_ID },
        },
      ],
    } satisfies SpaceSnapshot);
    if (!loaded.ok) throw new Error('Expected a valid reference fixture');
    const node = projectResourceNodes(loaded.space, {
      openResourceIds: new Set([REFERENCE_ID]),
    }).find((candidate) => candidate.id === REFERENCE_ID);
    if (node === undefined) throw new Error('Expected the Reference projection');
    const previewResize = vi.fn();
    const patch = decorateSharedResourceNode(
      node,
      context({
        resourceResize: {
          beginResize: () => undefined,
          previewResize,
          finishResize: () => undefined,
          cancelResize: () => undefined,
        },
      }),
    );
    expect(patch.resize?.minWidth).toBe(RESOURCE_SIZE.width);
    expect(patch.resize?.minHeight).toBe(RESOURCE_SIZE.height);
    patch.resize?.onResize({ width: 280, height: 220 });
    expect(previewResize).toHaveBeenCalledWith(REFERENCE_ID, { width: 280, height: 220 });
    patch.resize?.onResize({ width: 100, height: 100 });
    expect(previewResize).toHaveBeenCalledWith(REFERENCE_ID, RESOURCE_SIZE);
  });

  it('offers resize on every kind, Open or Closed, where the Map may be authored', () => {
    for (const [id, kind] of [
      [RESOURCE_ID, 'markdown'],
      [UR_ID, 'ur'],
    ] as const) {
      for (const open of [false, true]) {
        const patch = decorateSharedResourceNode(projectionNode(id, kind, open), context());
        expect(patch.resize?.minWidth).toBe(RESOURCE_SIZE.width);
        expect(patch.resize?.minHeight).toBe(RESOURCE_SIZE.height);
      }
    }
    expect(
      decorateSharedResourceNode(
        projectionNode(RESOURCE_ID, 'markdown'),
        context({ authorOnCanvas: false }),
      ).resize,
    ).toBeUndefined();
  });

  it('attaches the title editor only to the Resource holding the caret', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'reference'),
      context({ editingTitleResourceId: RESOURCE_ID }),
    );
    expect(patch.titleEditor).toBeDefined();
    expect(
      decorateSharedResourceNode(
        projectionNode(REFERENCE_ID, 'reference'),
        context({ editingTitleResourceId: RESOURCE_ID }),
      ).titleEditor,
    ).toBeUndefined();
  });
});

/**
 * An Ur Resource has no content (ADR 0113): it takes every shared Resource
 * operation and no content edit from any decorator.
 */
describe('an Ur Resource’s decoration', () => {
  it('offers title editing and entity actions, and no Open, Close or body editing', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(UR_ID, 'ur'),
      context({ resourceEntityActions: () => [] }),
    );
    expect(patch.onOpenChange).toBeUndefined();
    expect(patch.onBeginTitleEditing).toBeTypeOf('function');
    expect(patch.entityActions).toEqual([]);
  });

  /** An Ur Resource takes a Shape (ADR 0121), whatever its projected state. */
  it('offers the Shape choice where the Map may be authored', () => {
    const changeResourceShape = vi.fn();
    const ur = (open = false) => ofKind(projectionNode(UR_ID, 'ur', open), 'ur');
    for (const open of [false, true]) {
      decorateUrResourceNode(
        ur(open),
        context({ changeResourceShape }),
      ).kindOperations.onResourceShapeChange?.('ellipse');
    }
    expect(changeResourceShape.mock.calls).toEqual([
      [UR_ID, 'ellipse'],
      [UR_ID, 'ellipse'],
    ]);

    expect(
      decorateUrResourceNode(ur(), context({ changeResourceShape, authorOnCanvas: false }))
        .kindOperations.onResourceShapeChange,
    ).toBeUndefined();
    expect(
      decorateUrResourceNode(ur(), context({ changeResourceShape, editableResourceIds: new Set() }))
        .kindOperations.onResourceShapeChange,
    ).toBeUndefined();
    expect(
      decorateUrResourceNode(ur(), context()).kindOperations.onResourceShapeChange,
    ).toBeUndefined();
  });
});

describe('decorateMarkdownResourceNode', () => {
  it('offers body editing where the canvas is authored', () => {
    const beginBodyEditing = vi.fn();
    const markdown = ofKind(projectionNode(RESOURCE_ID, 'markdown', true), 'markdown');
    const { kindOperations } = decorateMarkdownResourceNode(
      markdown,
      context({ beginBodyEditing }),
    );
    expect(kindOperations.onBeginEdit).toBeTypeOf('function');
    kindOperations.onBeginEdit?.();
    expect(beginBodyEditing).toHaveBeenCalledWith(markdown);
    expect(
      decorateMarkdownResourceNode(markdown, context({ authorOnCanvas: false })).kindOperations
        .onBeginEdit,
    ).toBeUndefined();
  });

  it('enters the editing display, focused, on an Open Resource whose caret is live', () => {
    const markdown = ofKind(projectionNode(RESOURCE_ID, 'markdown', true), 'markdown');
    const patch = decorateMarkdownResourceNode(
      markdown,
      context({ bodyEditorResourceId: RESOURCE_ID }),
    );
    expect(patch.display).toMatchObject({
      shown: 'editing',
      content: { kind: 'markdown', via: 'self' },
      autoFocus: true,
    });
    expect(decorateMarkdownResourceNode(markdown, context()).display).toBeUndefined();
  });

  it('leaves a Closed Resource’s display alone although its caret is live', () => {
    expect(
      decorateMarkdownResourceNode(
        ofKind(projectionNode(RESOURCE_ID, 'markdown'), 'markdown'),
        context({ bodyEditorResourceId: RESOURCE_ID }),
      ).display,
    ).toBeUndefined();
  });
});

describe('decorateImageResourceNode', () => {
  const IMAGE_URL = 'https://example.com/figure.png';
  const imageNode = (open: boolean): ResourceFlowNodeOf<'image'> => {
    const node = projectionNode(RESOURCE_ID, 'markdown', open);
    return ofKind(
      {
        ...node,
        data: {
          ...node.data,
          ...bareKindData('image'),
          ...fixtureFacts('image'),
          display: open
            ? {
                shown: 'open',
                content: { kind: 'image', url: IMAGE_URL, via: 'self' },
              }
            : node.data.display,
        },
      },
      'image',
    );
  };
  const replacing = context({
    bodyEditorResourceId: RESOURCE_ID,
    replaceResourceImage: () => Promise.resolve(null),
  });

  it('enters the replacing display on an Open Image Resource whose caret is live', () => {
    expect(decorateImageResourceNode(imageNode(true), replacing).display).toMatchObject({
      shown: 'replacing',
      content: { kind: 'image', url: IMAGE_URL, via: 'self' },
      replacer: { accept: 'image/png' },
    });
  });

  it('leaves a Closed Image Resource’s display alone although its caret is live', () => {
    expect(decorateImageResourceNode(imageNode(false), replacing).display).toBeUndefined();
  });
});

describe('decorateSpaceResourceNode', () => {
  it('omits the rail while closed, unread, or read-only', () => {
    expect(
      decorateSpaceResourceNode(
        ofKind(projectionNode(SPACE_RESOURCE_ID, 'space'), 'space'),
        context(),
      ).kindOperations.spaceRail,
    ).toBeUndefined();
    expect(
      decorateSpaceResourceNode(
        ofKind(projectionNode(SPACE_RESOURCE_ID, 'space', true), 'space'),
        context({ spaceResourceTargets: NO_SPACE_RESOURCE_TARGETS }),
      ).kindOperations.spaceRail,
    ).toBeUndefined();
    expect(
      decorateSpaceResourceNode(
        ofKind(projectionNode(SPACE_RESOURCE_ID, 'space', true, true), 'space'),
        context(),
      ).kindOperations.spaceRail,
    ).toBeUndefined();
  });

  it('builds the rail for an Open Space Resource whose target is read, and still when authoring is withdrawn', () => {
    expect(
      decorateSpaceResourceNode(
        ofKind(projectionNode(SPACE_RESOURCE_ID, 'space', true), 'space'),
        context(),
      ).kindOperations.spaceRail,
    ).toBeDefined();
    expect(
      decorateSpaceResourceNode(
        ofKind(projectionNode(SPACE_RESOURCE_ID, 'space', true), 'space'),
        context({ authorOnCanvas: false }),
      ).kindOperations.spaceRail,
    ).toBeDefined();
  });

  it('withholds context notice when the rail is absent', () => {
    const patch = decorateSpaceResourceNode(
      ofKind(projectionNode(SPACE_RESOURCE_ID, 'space'), 'space'),
      context({ contextNotices: new Map([[SPACE_RESOURCE_ID, 'Link copied.']]) }),
    );
    expect(patch.contextNotice).toBeUndefined();
  });

  it('carries a context notice and portal Edit once the rail is present', () => {
    const onPortalEditingChange = vi.fn();
    const patch = decorateSpaceResourceNode(
      ofKind(projectionNode(SPACE_RESOURCE_ID, 'space', true), 'space'),
      context({
        contextNotices: new Map([[SPACE_RESOURCE_ID, 'Link copied.']]),
        onPortalEditingChange,
        portalEditing: new Set([SPACE_RESOURCE_ID]),
      }),
    );
    expect(patch.contextNotice).toBe('Link copied.');
    expect(patch.kindOperations.portal?.editing).toBe(true);
    expect(patch.kindOperations.portal?.onEditingChange).toBeTypeOf('function');
    patch.kindOperations.portal?.onEditingChange(false);
    expect(onPortalEditingChange).toHaveBeenCalledWith(SPACE_RESOURCE_ID, false);
  });
});
