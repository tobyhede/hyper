import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AuthoringAvailability } from '../src/authoring-availability';
import {
  drawnDropRefusal,
  mapSurfacePolicy,
  surfaceAvailability,
  surfaceOffers,
  withSurfacePolicy,
  type MapSurfacePolicy,
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

/** Every answer available, so what a policy withholds is all that differs. */
const EVERYTHING: AuthoringAvailability = {
  resourcesView: true,
  chromeTitleEdit: true,
  entityEdits: true,
  deleteResource: true,
  present: true,
  addResource: true,
  createSpaceResource: true,
  createMap: true,
  authorOnCanvas: true,
  authorInEmbeddedMap: true,
  editResourceBody: true,
  connectOnCanvas: true,
  dragNodes: true,
  selectNodes: true,
  navigate: true,
  replaceSession: true,
};

const NOTHING: AuthoringAvailability = {
  resourcesView: false,
  chromeTitleEdit: false,
  entityEdits: false,
  deleteResource: false,
  present: false,
  addResource: false,
  createSpaceResource: false,
  createMap: false,
  authorOnCanvas: false,
  authorInEmbeddedMap: false,
  editResourceBody: false,
  connectOnCanvas: false,
  dragNodes: false,
  selectNodes: false,
  navigate: false,
  replaceSession: false,
};

describe('what each policy offers on each drawing', () => {
  it.each([
    {
      policy: 'authoring',
      drawing: 'canvas',
      offers: { authoring: true, readOnly: false, editEmbeddedMap: true, present: true },
      availability: EVERYTHING,
    },
    {
      // An authoring embedded Map still opens, closes and moves the Space
      // Resources in it; Edit on them and presenting stay with the canvas.
      policy: 'authoring',
      drawing: 'drawn',
      offers: { authoring: true, readOnly: false, editEmbeddedMap: false, present: false },
      availability: { ...EVERYTHING, present: false, authorInEmbeddedMap: false },
    },
    {
      policy: 'inert',
      drawing: 'canvas',
      offers: { authoring: false, readOnly: false, editEmbeddedMap: false, present: false },
      availability: NOTHING,
    },
    {
      policy: 'inert',
      drawing: 'drawn',
      offers: { authoring: false, readOnly: false, editEmbeddedMap: false, present: false },
      availability: NOTHING,
    },
    {
      policy: 'read-only',
      drawing: 'canvas',
      offers: { authoring: false, readOnly: true, editEmbeddedMap: false, present: false },
      availability: NOTHING,
    },
    {
      policy: 'read-only',
      drawing: 'drawn',
      offers: { authoring: false, readOnly: true, editEmbeddedMap: false, present: false },
      availability: NOTHING,
    },
  ] as const)('$policy on the $drawing Map', ({ policy, drawing, offers, availability }) => {
    expect(surfaceOffers(policy, drawing)).toEqual(offers);
    expect(surfaceAvailability(EVERYTHING, policy, drawing)).toEqual(availability);
  });

  it('only ever withholds what the ordinary availability offers', () => {
    const answers = fc.record<AuthoringAvailability>({
      resourcesView: fc.boolean(),
      chromeTitleEdit: fc.boolean(),
      entityEdits: fc.boolean(),
      deleteResource: fc.boolean(),
      present: fc.boolean(),
      addResource: fc.boolean(),
      createSpaceResource: fc.boolean(),
      createMap: fc.boolean(),
      authorOnCanvas: fc.boolean(),
      authorInEmbeddedMap: fc.boolean(),
      editResourceBody: fc.boolean(),
      connectOnCanvas: fc.boolean(),
      dragNodes: fc.boolean(),
      selectNodes: fc.boolean(),
      navigate: fc.boolean(),
      replaceSession: fc.boolean(),
    });
    fc.assert(
      fc.property(
        answers,
        fc.constantFrom<MapSurfacePolicy>('authoring', 'inert', 'read-only'),
        fc.constantFrom('canvas' as const, 'drawn' as const),
        (available, policy, drawing) => {
          const surfaced = surfaceAvailability(available, policy, drawing);
          for (const [answer, offered] of Object.entries(surfaced)) {
            if (offered) expect(available).toHaveProperty(answer, true);
          }
        },
      ),
    );
  });

  it('passes read-only to every Map inside, and is inert at most below the first level', () => {
    const POLICIES = ['authoring', 'inert', 'read-only'] as const;
    const RANK = {
      'read-only': 0,
      inert: 1,
      authoring: 2,
    } as const satisfies Record<MapSurfacePolicy, number>;
    fc.assert(
      fc.property(
        fc.record({
          inherited: fc.constantFrom(...POLICIES),
          throughReference: fc.boolean(),
          stale: fc.boolean(),
          depth: fc.integer({ min: 1, max: 6 }),
          editing: fc.boolean(),
        }),
        (input) => {
          const policy = mapSurfacePolicy(input);
          expect(RANK[policy]).toBeLessThanOrEqual(RANK[input.inherited]);
          if (input.inherited === 'read-only') expect(policy).toBe('read-only');
          if (input.depth > 1) expect(policy).not.toBe('authoring');
        },
      ),
    );
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
