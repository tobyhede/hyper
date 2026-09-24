import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { completesResourceDrop, type ResourcesDrag } from '../src/resources-drag';

const resourceId = uuidSchema.parse('7d0f2a4e-3c1b-4f6a-9e2d-1a2b3c4d5e6f');
const otherResourceId = uuidSchema.parse('0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e');
const mapId = uuidSchema.parse('5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b');
const otherMapId = uuidSchema.parse('9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d');

describe('completesResourceDrop', () => {
  it('completes a drop of the Resource the drag carried, over the Map it started over', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId };

    expect(completesResourceDrop(drag, resourceId, mapId)).toBe(true);
  });

  it('completes nothing when no drag began in the Resources list', () => {
    expect(completesResourceDrop(null, resourceId, mapId)).toBe(false);
  });

  it('refuses a drop naming a different Resource from the one the drag carried', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId };

    expect(completesResourceDrop(drag, otherResourceId, mapId)).toBe(false);
  });

  it('refuses a drop over a Map other than the one the drag started over', () => {
    const drag: ResourcesDrag = { kind: 'resource', resourceId, mapId };

    expect(completesResourceDrop(drag, resourceId, otherMapId)).toBe(false);
  });

  it('never reads a Space drag as a Resource drop, even when the ids coincide', () => {
    const drag: ResourcesDrag = { kind: 'space', spaceId: resourceId, mapId };

    expect(completesResourceDrop(drag, resourceId, mapId)).toBe(false);
  });
});
