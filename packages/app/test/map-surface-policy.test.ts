import { describe, expect, it } from 'vitest';
import {
  drawnDropRefusal,
  mapSurfacePolicy,
  surfaceOffers,
  withSurfacePolicy,
} from '../src/map-surface-policy';
import { node } from './render-adapter-fixtures';

const RESOURCE = '00000000-0000-4000-8000-000000000001';

describe('a drawn Map’s policy', () => {
  it.each([
    {
      inherited: 'authoring',
      throughReference: false,
      stale: false,
      depth: 1,
      editing: true,
      policy: 'authoring',
    },
    {
      inherited: 'authoring',
      throughReference: false,
      stale: false,
      depth: 1,
      editing: false,
      policy: 'inert',
    },
    {
      inherited: 'authoring',
      throughReference: false,
      stale: false,
      depth: 2,
      editing: true,
      policy: 'inert',
    },
    {
      inherited: 'inert',
      throughReference: false,
      stale: false,
      depth: 1,
      editing: true,
      policy: 'inert',
    },
    {
      inherited: 'authoring',
      throughReference: true,
      stale: false,
      depth: 1,
      editing: true,
      policy: 'read-only',
    },
    {
      inherited: 'authoring',
      throughReference: false,
      stale: true,
      depth: 1,
      editing: true,
      policy: 'read-only',
    },
    {
      inherited: 'read-only',
      throughReference: false,
      stale: false,
      depth: 2,
      editing: false,
      policy: 'read-only',
    },
  ] as const)(
    'is $policy from $inherited at depth $depth (reference $throughReference, stale $stale, editing $editing)',
    ({ policy, ...input }) => {
      expect(mapSurfacePolicy(input)).toBe(policy);
    },
  );

  it('offers Edit and presenting only on the canvas’s own authoring Map', () => {
    expect(surfaceOffers('authoring', 'canvas')).toEqual({
      authoring: true,
      readOnly: false,
      editEmbeddedMap: true,
      present: true,
    });
    expect(surfaceOffers('authoring', 'drawn')).toEqual({
      authoring: true,
      readOnly: false,
      editEmbeddedMap: false,
      present: false,
    });
  });
});

describe('stamping a policy onto a projected Resource', () => {
  it('keeps an authoring node as it is', () => {
    const projected = node(RESOURCE, 0, 0);
    expect(withSurfacePolicy(projected, 'authoring')).toBe(projected);
  });

  it.each([
    { policy: 'inert', readOnly: false },
    { policy: 'read-only', readOnly: true },
  ] as const)('withholds every gesture from a $policy node', ({ policy, readOnly }) => {
    const stamped = withSurfacePolicy(node(RESOURCE, 0, 0), policy);
    expect(stamped).toMatchObject({
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      deletable: false,
      className: 'rf-resource-node nopan nowheel nodrag',
      style: { pointerEvents: 'none' },
      data: { readOnly, connectionAuthoringEnabled: false },
    });
  });
});

describe('a drop on a drawn Map', () => {
  it.each([
    { policy: 'read-only', depth: 1, adding: true, code: 'drawn-map-read-only' },
    { policy: 'inert', depth: 1, adding: true, code: 'drawn-map-not-in-edit' },
    { policy: 'inert', depth: 2, adding: true, code: 'drawn-map-nested' },
    { policy: 'authoring', depth: 1, adding: false, code: 'drawn-map-unavailable' },
  ] as const)(
    'on a $policy Map at depth $depth is refused as $code',
    ({ policy, depth, adding, code }) => {
      expect(drawnDropRefusal(policy, depth, adding)).toEqual({ code });
    },
  );

  it('lands on an authoring Map that takes a new Resource', () => {
    expect(drawnDropRefusal('authoring', 1, true)).toBeNull();
  });
});
