import { describe, expect, it, vi } from 'vitest';
import { SPACE_RESOURCE_MIN_OPEN_SIZE, uuidSchema, type ResourceId } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  decorateMarkdownResourceNode,
  decorateSharedResourceNode,
  decorateSpaceResourceNode,
  type CanvasResourceDecorationContext,
} from '../src/canvas-resource-decoration';
import { RESOURCE_SIZE } from '../src/resource';
import { completeEmbeddedAuthoring } from '../src/embedded-authoring';
import { NO_SPACE_RESOURCE_TARGETS } from '../src/space-resource-targets';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const target: SpaceResourceTarget = {
  id: TARGET_SPACE_ID,
  title: 'Architecture',
  maps: [
    {
      id: TARGET_MAP_ID,
      title: 'Collection 1',
      graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview' }],
    },
  ],
};

const projectionNode = (
  resourceId: ResourceId,
  kind: 'markdown' | 'reference' | 'space',
  expanded = false,
  readOnly = false,
): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: { x: 0, y: 0 },
  width: expanded ? 640 : RESOURCE_SIZE.width,
  height: expanded ? 480 : RESOURCE_SIZE.height,
  data: {
    resourceId,
    title: 'A',
    readOnly,
    kind,
    expanded,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
  },
});

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
  editableResourceIds: new Set([RESOURCE_ID, REFERENCE_ID, SPACE_RESOURCE_ID]),
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
  continuation: undefined,
  commandOutcomes: undefined,
  completeSpaceResourceSelection: () => null,
  completeEmbedded: completeEmbeddedAuthoring,
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
    expect(patch.onEditResource).toBeTypeOf('function');
    expect(patch.onBeginTitleEditing).toBeTypeOf('function');
    expect(patch.entityActions).toEqual([]);
    expect(patch.onBeginBodyEditing).toBeUndefined();
    expect(patch.bodyEditor).toBeUndefined();
    expect(patch.spaceRail).toBeUndefined();
  });

  it('withholds competing title controls while a body caret is live', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(RESOURCE_ID, 'markdown', true),
      context({ bodyEditing: true }),
    );
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.onEditResource).toBeTypeOf('function');
  });

  it('withholds every authoring control from a projected Resource absent from the working Space', () => {
    const patch = decorateSharedResourceNode(
      projectionNode(MISSING_RESOURCE_ID, 'markdown', true),
      context(),
    );
    expect(patch.onEditResource).toBeUndefined();
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.resize).toBeUndefined();
    expect(patch.titleEditor).toBeUndefined();
    expect(patch.entityActions).toBeUndefined();
  });

  it('floors an Open Space Resource resize above its footer while still reaching Close', () => {
    const previewResize = vi.fn();
    const patch = decorateSharedResourceNode(
      projectionNode(SPACE_RESOURCE_ID, 'space', true),
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
    expect(previewResize).toHaveBeenCalledWith(SPACE_RESOURCE_ID, SPACE_RESOURCE_MIN_OPEN_SIZE);
    patch.resize?.onResize(RESOURCE_SIZE);
    expect(previewResize).toHaveBeenCalledWith(SPACE_RESOURCE_ID, RESOURCE_SIZE);
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

describe('decorateMarkdownResourceNode', () => {
  it('attaches body editing only to a markdown Resource', () => {
    const beginBodyEditing = vi.fn();
    const markdown = projectionNode(RESOURCE_ID, 'markdown', true);
    const patch = decorateMarkdownResourceNode(markdown, context({ beginBodyEditing }));
    expect(patch.onBeginBodyEditing).toBeTypeOf('function');
    patch.onBeginBodyEditing?.();
    expect(beginBodyEditing).toHaveBeenCalledWith(markdown);
    expect(
      decorateMarkdownResourceNode(projectionNode(REFERENCE_ID, 'reference', true), context())
        .onBeginBodyEditing,
    ).toBeUndefined();
    expect(
      decorateMarkdownResourceNode(projectionNode(SPACE_RESOURCE_ID, 'space', true), context())
        .onBeginBodyEditing,
    ).toBeUndefined();
  });

  it('installs the body editor only on the Resource whose caret is live', () => {
    expect(
      decorateMarkdownResourceNode(
        projectionNode(RESOURCE_ID, 'markdown', true),
        context({ bodyEditorResourceId: RESOURCE_ID }),
      ).bodyEditor,
    ).toBeDefined();
    expect(
      decorateMarkdownResourceNode(projectionNode(RESOURCE_ID, 'markdown', true), context())
        .bodyEditor,
    ).toBeUndefined();
  });
});

describe('decorateSpaceResourceNode', () => {
  it('omits the rail while closed, unread, or read-only', () => {
    expect(
      decorateSpaceResourceNode(projectionNode(SPACE_RESOURCE_ID, 'space'), context()).spaceRail,
    ).toBeUndefined();
    expect(
      decorateSpaceResourceNode(
        projectionNode(SPACE_RESOURCE_ID, 'space', true),
        context({ spaceResourceTargets: NO_SPACE_RESOURCE_TARGETS }),
      ).spaceRail,
    ).toBeUndefined();
    expect(
      decorateSpaceResourceNode(projectionNode(SPACE_RESOURCE_ID, 'space', true, true), context())
        .spaceRail,
    ).toBeUndefined();
  });

  it('builds the rail for an Open Space Resource whose target is read, and still when authoring is withdrawn', () => {
    expect(
      decorateSpaceResourceNode(projectionNode(SPACE_RESOURCE_ID, 'space', true), context())
        .spaceRail,
    ).toBeDefined();
    expect(
      decorateSpaceResourceNode(
        projectionNode(SPACE_RESOURCE_ID, 'space', true),
        context({ authorOnCanvas: false }),
      ).spaceRail,
    ).toBeDefined();
  });

  it('leaves markdown and Reference Resource nodes untouched', () => {
    expect(
      decorateSpaceResourceNode(projectionNode(RESOURCE_ID, 'markdown', true), context()),
    ).toEqual({});
    expect(
      decorateSpaceResourceNode(projectionNode(REFERENCE_ID, 'reference', true), context()),
    ).toEqual({});
  });

  it('withholds context notice when the rail is absent', () => {
    const patch = decorateSpaceResourceNode(
      projectionNode(SPACE_RESOURCE_ID, 'space'),
      context({ contextNotices: new Map([[SPACE_RESOURCE_ID, 'Link copied.']]) }),
    );
    expect(patch.contextNotice).toBeUndefined();
  });

  it('carries a context notice and portal Edit once the rail is present', () => {
    const onPortalEditingChange = vi.fn();
    const patch = decorateSpaceResourceNode(
      projectionNode(SPACE_RESOURCE_ID, 'space', true),
      context({
        contextNotices: new Map([[SPACE_RESOURCE_ID, 'Link copied.']]),
        onPortalEditingChange,
        portalEditing: new Set([SPACE_RESOURCE_ID]),
      }),
    );
    expect(patch.contextNotice).toBe('Link copied.');
    expect(patch.portal?.editing).toBe(true);
    expect(patch.portal?.onEditingChange).toBeTypeOf('function');
    patch.portal?.onEditingChange(false);
    expect(onPortalEditingChange).toHaveBeenCalledWith(SPACE_RESOURCE_ID, false);
  });
});
