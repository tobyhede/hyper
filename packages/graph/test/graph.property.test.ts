import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Manifest, PresentationPath } from '@project/core';
import { clampStepIndex, nextStepIndex, prevStepIndex, validateReferences } from '../src/index';

/** Build a structurally-consistent manifest from a list of ids. */
function manifestFromIds(ids: string[]): Manifest {
  return {
    version: 1,
    title: 'Generated',
    cards: ids.map((id) => ({ id: `card-${id}`, title: id, content: `cards/${id}.md` })),
    nodes: ids.map((id) => ({ id: `node-${id}`, cardId: `card-${id}`, position: { x: 0, y: 0 } })),
    edges: [],
    paths: [
      {
        id: 'main',
        title: 'Main',
        steps: ids.map((id) => ({ target: `node-${id}` })),
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

  it('breaking any single path step is always detected', () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        const manifest = manifestFromIds(ids);
        const path = manifest.paths[0]!;
        path.steps[0]!.target = '__does_not_exist__';
        const errors = validateReferences(manifest);
        expect(errors.some((e) => e.kind === 'unresolved-path-step')).toBe(true);
      }),
    );
  });
});

describe('navigation properties', () => {
  const pathArb: fc.Arbitrary<PresentationPath> = fc.integer({ min: 1, max: 30 }).map((n) => ({
    id: 'p',
    title: 'p',
    steps: Array.from({ length: n }, (_, i) => ({ target: `n${i}` })),
  }));

  it('clamp always yields an in-range index', () => {
    fc.assert(
      fc.property(pathArb, fc.integer(), (path, index) => {
        const clamped = clampStepIndex(path, index);
        expect(clamped).toBeGreaterThanOrEqual(0);
        expect(clamped).toBeLessThan(path.steps.length);
      }),
    );
  });

  it('next/prev never leave the range and are inverse at the interior', () => {
    fc.assert(
      fc.property(pathArb, fc.nat(), (path, raw) => {
        const index = clampStepIndex(path, raw);
        const forward = nextStepIndex(path, index);
        const back = prevStepIndex(path, index);
        expect(forward).toBeGreaterThanOrEqual(0);
        expect(forward).toBeLessThan(path.steps.length);
        expect(back).toBeGreaterThanOrEqual(0);
        expect(back).toBeLessThan(path.steps.length);
        expect(forward).toBeGreaterThanOrEqual(index);
        expect(back).toBeLessThanOrEqual(index);
      }),
    );
  });
});
