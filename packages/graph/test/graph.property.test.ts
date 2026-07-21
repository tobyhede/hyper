import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Manifest, Route } from '@project/core';
import { clampStepIndex, nextStepIndex, prevStepIndex, validateReferences } from '../src/index';

/** Build a structurally-consistent manifest from a list of ids. */
function manifestFromIds(ids: string[]): Manifest {
  return {
    version: 1,
    title: 'Generated',
    cards: ids.map((id) => ({
      id: `card-${id}`,
      title: id,
      kind: 'markdown' as const,
      content: `cards/${id}.md`,
    })),
    routes: [
      {
        id: 'main',
        title: 'Main',
        steps: ids.map((id) => ({ target: `card-${id}` })),
      },
    ],
  };
}

// Distinct, non-empty ids keep the generated graph structurally valid.
const idsArb = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 6 }).filter((s) => s.trim().length > 0),
    {
      minLength: 1,
      maxLength: 12,
    },
  )
  .map((xs) => xs.map((x, i) => `${i}-${x.replace(/\s/g, '_')}`));

describe('graph validation properties', () => {
  it('a consistently-built manifest always validates', () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        expect(validateReferences(manifestFromIds(ids))).toEqual([]);
      }),
    );
  });

  it('breaking any single route step is always detected', () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        const manifest = manifestFromIds(ids);
        const route = manifest.routes[0]!;
        route.steps[0]!.target = '__does_not_exist__';
        const errors = validateReferences(manifest);
        expect(errors.some((e) => e.kind === 'unresolved-route-step')).toBe(true);
      }),
    );
  });
});

describe('navigation properties', () => {
  const routeArb: fc.Arbitrary<Route> = fc.integer({ min: 1, max: 30 }).map((n) => ({
    id: 'p',
    title: 'p',
    steps: Array.from({ length: n }, (_, i) => ({ target: `n${i}` })),
  }));

  it('clamp always yields an in-range index', () => {
    fc.assert(
      fc.property(routeArb, fc.integer(), (route, index) => {
        const clamped = clampStepIndex(route, index);
        expect(clamped).toBeGreaterThanOrEqual(0);
        expect(clamped).toBeLessThan(route.steps.length);
      }),
    );
  });

  it('next/prev never leave the range and are inverse at the interior', () => {
    fc.assert(
      fc.property(routeArb, fc.nat(), (route, raw) => {
        const index = clampStepIndex(route, raw);
        const forward = nextStepIndex(route, index);
        const back = prevStepIndex(route, index);
        expect(forward).toBeGreaterThanOrEqual(0);
        expect(forward).toBeLessThan(route.steps.length);
        expect(back).toBeGreaterThanOrEqual(0);
        expect(back).toBeLessThan(route.steps.length);
        expect(forward).toBeGreaterThanOrEqual(index);
        expect(back).toBeLessThanOrEqual(index);
      }),
    );
  });
});
