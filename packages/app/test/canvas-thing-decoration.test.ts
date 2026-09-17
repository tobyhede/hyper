import { describe, expect, it, vi } from 'vitest';
import { SPACE_THING_MIN_OPEN_SIZE, uuidSchema, type ThingId } from '@project/core';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import {
  decorateMarkdownThingNode,
  decorateSharedThingNode,
  decorateSpaceThingNode,
  type CanvasThingDecorationContext,
} from '../src/canvas-thing-decoration';
import { THING_SIZE } from '../src/thing';
import { completeEmbeddedAuthoring } from '../src/embedded-authoring';
import { NO_SPACE_THING_TARGETS } from '../src/space-thing-targets';
import type { SpaceThingTarget } from '../src/space-thing-lifecycle';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const REFERENCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const MISSING_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const target: SpaceThingTarget = {
  id: TARGET_SPACE_ID,
  title: 'Architecture',
  diagrams: [
    {
      id: TARGET_DIAGRAM_ID,
      title: 'Collection 1',
      graphs: [{ id: TARGET_GRAPH_ID, title: 'Overview' }],
    },
  ],
};

const projectionNode = (
  thingId: ThingId,
  kind: 'markdown' | 'reference' | 'space',
  expanded = false,
  readOnly = false,
): ThingFlowNode => ({
  id: thingId,
  type: 'thing',
  position: { x: 0, y: 0 },
  width: expanded ? 640 : THING_SIZE.width,
  height: expanded ? 480 : THING_SIZE.height,
  data: {
    thingId,
    title: 'A',
    readOnly,
    kind,
    expanded,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
  },
});

const spaceDocument = {
  title: 'Architecture',
  kind: 'space' as const,
  spaceId: TARGET_SPACE_ID,
  diagram: TARGET_DIAGRAM_ID,
  graph: TARGET_GRAPH_ID,
};

const context = (
  overrides: Partial<CanvasThingDecorationContext> = {},
): CanvasThingDecorationContext => ({
  authorOnCanvas: true,
  bodyEditing: false,
  editableThingIds: new Set([THING_ID, REFERENCE_ID, SPACE_THING_ID]),
  openThing: () => 'completed',
  closeThing: () => 'completed',
  beginTitleEditing: () => undefined,
  onSelectThing: () => undefined,
  thingResize: {
    beginResize: () => undefined,
    previewResize: () => undefined,
    finishResize: () => undefined,
    cancelResize: () => undefined,
  },
  editingTitleThingId: null,
  completeThingTitle: () => null,
  clearCaret: () => undefined,
  beginBodyEditing: () => undefined,
  bodyEditorThingId: null,
  completeThingBody: () => 'completed',
  containingSpaceId: SPACE_ID,
  spaceDocuments: new Map([[SPACE_THING_ID, spaceDocument]]),
  spaceThingTargets: new Map([[TARGET_SPACE_ID, target]]),
  spaces: null,
  continuation: undefined,
  completeSpaceThingSelection: () => null,
  completeEmbedded: completeEmbeddedAuthoring,
  portalEditing: undefined,
  onPortalEditingChange: undefined,
  contextNotices: new Map(),
  onContextEditingChange: () => undefined,
  onContextReport: () => undefined,
  ...overrides,
});

describe('decorateSharedThingNode', () => {
  it('offers Open, title editing and entity actions on a Thing of the working Space', () => {
    const patch = decorateSharedThingNode(
      projectionNode(THING_ID, 'markdown'),
      context({ thingEntityActions: () => [] }),
    );
    expect(patch.titleEditingEnabled).toBe(true);
    expect(patch.thingEditingEnabled).toBe(true);
    expect(patch.onEditThing).toBeTypeOf('function');
    expect(patch.onBeginTitleEditing).toBeTypeOf('function');
    expect(patch.entityActions).toEqual([]);
    expect(patch.onBeginBodyEditing).toBeUndefined();
    expect(patch.bodyEditor).toBeUndefined();
    expect(patch.spaceRail).toBeUndefined();
  });

  it('withholds competing title controls while a body caret is live', () => {
    const patch = decorateSharedThingNode(
      projectionNode(THING_ID, 'markdown', true),
      context({ bodyEditing: true }),
    );
    expect(patch.titleEditingEnabled).toBe(false);
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.thingEditingEnabled).toBe(true);
  });

  it('withholds every authoring control from a projected Thing absent from the working Space', () => {
    const patch = decorateSharedThingNode(
      projectionNode(MISSING_THING_ID, 'markdown', true),
      context(),
    );
    expect(patch.titleEditingEnabled).toBe(false);
    expect(patch.thingEditingEnabled).toBeUndefined();
    expect(patch.onEditThing).toBeUndefined();
    expect(patch.onBeginTitleEditing).toBeUndefined();
    expect(patch.resize).toBeUndefined();
    expect(patch.titleEditor).toBeUndefined();
    expect(patch.entityActions).toBeUndefined();
  });

  it('floors an Open Space Thing resize above its footer while still reaching Close', () => {
    const previewResize = vi.fn();
    const patch = decorateSharedThingNode(
      projectionNode(SPACE_THING_ID, 'space', true),
      context({
        thingResize: {
          beginResize: () => undefined,
          previewResize,
          finishResize: () => undefined,
          cancelResize: () => undefined,
        },
      }),
    );
    expect(patch.resize?.minWidth).toBe(THING_SIZE.width);
    expect(patch.resize?.minHeight).toBe(THING_SIZE.height);
    patch.resize?.onResize({ width: 280, height: 220 });
    expect(previewResize).toHaveBeenCalledWith(SPACE_THING_ID, SPACE_THING_MIN_OPEN_SIZE);
    patch.resize?.onResize(THING_SIZE);
    expect(previewResize).toHaveBeenCalledWith(SPACE_THING_ID, THING_SIZE);
  });

  it('attaches the title editor only to the Thing holding the caret', () => {
    const patch = decorateSharedThingNode(
      projectionNode(THING_ID, 'reference'),
      context({ editingTitleThingId: THING_ID }),
    );
    expect(patch.titleEditor).toBeDefined();
    expect(
      decorateSharedThingNode(
        projectionNode(REFERENCE_ID, 'reference'),
        context({ editingTitleThingId: THING_ID }),
      ).titleEditor,
    ).toBeUndefined();
  });
});

describe('decorateMarkdownThingNode', () => {
  it('attaches body editing only to a markdown Thing', () => {
    const beginBodyEditing = vi.fn();
    const markdown = projectionNode(THING_ID, 'markdown', true);
    const patch = decorateMarkdownThingNode(markdown, context({ beginBodyEditing }));
    expect(patch.onBeginBodyEditing).toBeTypeOf('function');
    patch.onBeginBodyEditing?.();
    expect(beginBodyEditing).toHaveBeenCalledWith(markdown);
    expect(
      decorateMarkdownThingNode(projectionNode(REFERENCE_ID, 'reference', true), context())
        .onBeginBodyEditing,
    ).toBeUndefined();
    expect(
      decorateMarkdownThingNode(projectionNode(SPACE_THING_ID, 'space', true), context())
        .onBeginBodyEditing,
    ).toBeUndefined();
  });

  it('installs the body editor only on the Thing whose caret is live', () => {
    expect(
      decorateMarkdownThingNode(
        projectionNode(THING_ID, 'markdown', true),
        context({ bodyEditorThingId: THING_ID }),
      ).bodyEditor,
    ).toBeDefined();
    expect(
      decorateMarkdownThingNode(projectionNode(THING_ID, 'markdown', true), context()).bodyEditor,
    ).toBeUndefined();
  });
});

describe('decorateSpaceThingNode', () => {
  it('omits the rail while closed, unread, or read-only', () => {
    expect(
      decorateSpaceThingNode(projectionNode(SPACE_THING_ID, 'space'), context()).spaceRail,
    ).toBeUndefined();
    expect(
      decorateSpaceThingNode(
        projectionNode(SPACE_THING_ID, 'space', true),
        context({ spaceThingTargets: NO_SPACE_THING_TARGETS }),
      ).spaceRail,
    ).toBeUndefined();
    expect(
      decorateSpaceThingNode(projectionNode(SPACE_THING_ID, 'space', true, true), context())
        .spaceRail,
    ).toBeUndefined();
  });

  it('builds the rail for an Open Space Thing whose target is read, and still when authoring is withdrawn', () => {
    expect(
      decorateSpaceThingNode(projectionNode(SPACE_THING_ID, 'space', true), context()).spaceRail,
    ).toBeDefined();
    expect(
      decorateSpaceThingNode(
        projectionNode(SPACE_THING_ID, 'space', true),
        context({ authorOnCanvas: false }),
      ).spaceRail,
    ).toBeDefined();
  });

  it('leaves markdown and Reference Thing nodes untouched', () => {
    expect(decorateSpaceThingNode(projectionNode(THING_ID, 'markdown', true), context())).toEqual(
      {},
    );
    expect(
      decorateSpaceThingNode(projectionNode(REFERENCE_ID, 'reference', true), context()),
    ).toEqual({});
  });

  it('withholds context notice when the rail is absent', () => {
    const patch = decorateSpaceThingNode(
      projectionNode(SPACE_THING_ID, 'space'),
      context({ contextNotices: new Map([[SPACE_THING_ID, 'Link copied.']]) }),
    );
    expect(patch.contextNotice).toBeUndefined();
  });

  it('carries a context notice and portal Edit once the rail is present', () => {
    const onPortalEditingChange = vi.fn();
    const patch = decorateSpaceThingNode(
      projectionNode(SPACE_THING_ID, 'space', true),
      context({
        contextNotices: new Map([[SPACE_THING_ID, 'Link copied.']]),
        onPortalEditingChange,
        portalEditing: new Set([SPACE_THING_ID]),
      }),
    );
    expect(patch.contextNotice).toBe('Link copied.');
    expect(patch.portal?.editing).toBe(true);
    expect(patch.portal?.onEditingChange).toBeTypeOf('function');
    patch.portal?.onEditingChange(false);
    expect(onPortalEditingChange).toHaveBeenCalledWith(SPACE_THING_ID, false);
  });
});
