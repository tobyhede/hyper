import type { NodeChange } from '@xyflow/react';
import { uuidSchema, type Resource, type ResourceContent, type UUID } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { CLOSED_DISPLAY, type ResourceDisplay } from '@project/ui';
import type { RenderAdapter } from '../src/render-adapter';

export function node(id: string, x: number, y: number, title = id): ResourceFlowNode {
  return {
    id,
    type: 'resource',
    position: { x, y },
    className: 'rf-resource-node',
    data: {
      resourceId: uuidSchema.parse(id),
      title,
      readOnly: false,
      kind: 'markdown',
      active: false,
      selectedForAuthoring: false,
      display: CLOSED_DISPLAY,
      activeGraphId: null,
      activeGraphColor: '#8a94a6',
    },
  };
}

const FIXTURE_TARGET_SPACE = uuidSchema.parse('00000000-0000-4000-8000-0000000000fa');
const FIXTURE_TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-0000000000fb');
const FIXTURE_TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-0000000000fc');

/**
 * What the projection shows for a fixture Resource of `kind`: Closed with no
 * content, or Open with content of its own kind (a Reference Resource's is a
 * Target's Markdown). `space` names the view an Open Space Resource shows.
 */
export function fixtureDisplay(
  open: boolean,
  kind: Exclude<Resource['kind'], 'image'>,
  source = '',
  space: { readonly spaceId: UUID; readonly map: UUID } = {
    spaceId: FIXTURE_TARGET_SPACE,
    map: FIXTURE_TARGET_MAP,
  },
): ResourceDisplay {
  if (!open) return CLOSED_DISPLAY;
  const content: ResourceContent =
    kind === 'space'
      ? {
          kind: 'space',
          view: { ...space, graph: FIXTURE_TARGET_GRAPH, framing: undefined },
          via: 'self',
        }
      : { kind: 'markdown', source, via: kind === 'reference' ? 'reference' : 'self' };
  return { shown: 'open', content };
}

export function moving(id: string, x: number, y: number): NodeChange<ResourceFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: true }];
}

export function settled(id: string, x: number, y: number): NodeChange<ResourceFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: false }];
}

export function completeDrag(store: RenderAdapter, id: string, x: number, y: number): void {
  store.getState().changeNodes(moving(id, x, y));
  store.getState().changeNodes(settled(id, x, y));
}
