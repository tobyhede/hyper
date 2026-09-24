import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  completedSpaceDrag,
  completedResourceDrag,
  type ResourcesDrag,
} from '../src/resources-drag';

const resourceId = uuidSchema.parse('7d0f2a4e-3c1b-4f6a-9e2d-1a2b3c4d5e6f');
const otherResourceId = uuidSchema.parse('0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e');
const mapId = uuidSchema.parse('5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b');
const otherMapId = uuidSchema.parse('9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d');
const blueprint = {
  id: uuidSchema.parse('3f2e1d0c-9b8a-4f7e-8d6c-5b4a3f2e1d0c'),
  title: 'Blueprint',
};

describe('completedResourceDrag', () => {
  it('answers the Resource drag a drop of its Resource completes, over the Map it started over', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId, settle: vi.fn() };

    expect(completedResourceDrag(drag, resourceId, mapId)).toBe(drag);
  });

  it('completes nothing when no drag began in the Resources list', () => {
    expect(completedResourceDrag(null, resourceId, mapId)).toBeNull();
  });

  it('refuses a drop naming a different Resource from the one the drag carried', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId, settle: vi.fn() };

    expect(completedResourceDrag(drag, otherResourceId, mapId)).toBeNull();
  });

  it('refuses a drop over a Map other than the one the drag started over', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId, settle: vi.fn() };

    expect(completedResourceDrag(drag, resourceId, otherMapId)).toBeNull();
  });

  it('never reads a Space drag as a Resource drop, even when the ids coincide', () => {
    const drag: ResourcesDrag = {
      kind: 'space',
      space: { id: resourceId, title: 'Blueprint' },
      mapId,
      settle: vi.fn(),
    };

    expect(completedResourceDrag(drag, resourceId, mapId)).toBeNull();
  });
});

describe('completedSpaceDrag', () => {
  it('answers the Space drag a drop of its Space completes, over the Map it started over', () => {
    const drag: ResourcesDrag = { kind: 'space', space: blueprint, mapId, settle: vi.fn() };

    expect(completedSpaceDrag(drag, blueprint.id, mapId)).toBe(drag);
  });

  it('completes nothing when no drag began in the Resources list', () => {
    expect(completedSpaceDrag(null, blueprint.id, mapId)).toBeNull();
  });

  it('refuses a drop naming a different Space from the one the drag carried', () => {
    const drag: ResourcesDrag = { kind: 'space', space: blueprint, mapId, settle: vi.fn() };

    expect(completedSpaceDrag(drag, otherResourceId, mapId)).toBeNull();
  });

  it('refuses a drop over a Map other than the one the drag started over', () => {
    const drag: ResourcesDrag = { kind: 'space', space: blueprint, mapId, settle: vi.fn() };

    expect(completedSpaceDrag(drag, blueprint.id, otherMapId)).toBeNull();
  });

  it('never reads a Resource drag as a Space drop, even when the ids coincide', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId, settle: vi.fn() };

    expect(completedSpaceDrag(drag, resourceId, mapId)).toBeNull();
  });
});
