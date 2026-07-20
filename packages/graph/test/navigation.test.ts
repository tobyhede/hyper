import { describe, expect, it } from 'vitest';
import type { Route } from '@project/core';
import {
  canGoNext,
  canGoPrev,
  clampStepIndex,
  nextStepIndex,
  cardIdAtStep,
  prevStepIndex,
  stepAt,
  stepCount,
} from '../src/index';

const route: Route = {
  id: 'main',
  title: 'Main',
  steps: [{ target: 'n0' }, { target: 'n1' }, { target: 'n2' }],
};

describe('route navigation', () => {
  it('counts steps', () => {
    expect(stepCount(route)).toBe(3);
  });

  it('clamps indices into range', () => {
    expect(clampStepIndex(route, -5)).toBe(0);
    expect(clampStepIndex(route, 99)).toBe(2);
    expect(clampStepIndex(route, 1)).toBe(1);
    expect(clampStepIndex(route, Number.NaN)).toBe(0);
  });

  it('walks forward and stops at the end', () => {
    expect(nextStepIndex(route, 0)).toBe(1);
    expect(nextStepIndex(route, 1)).toBe(2);
    expect(nextStepIndex(route, 2)).toBe(2);
  });

  it('walks backward and stops at the start', () => {
    expect(prevStepIndex(route, 2)).toBe(1);
    expect(prevStepIndex(route, 1)).toBe(0);
    expect(prevStepIndex(route, 0)).toBe(0);
  });

  it('reports edges of the range', () => {
    expect(canGoPrev(route, 0)).toBe(false);
    expect(canGoNext(route, 0)).toBe(true);
    expect(canGoPrev(route, 2)).toBe(true);
    expect(canGoNext(route, 2)).toBe(false);
  });

  it('resolves the target card id at a step', () => {
    expect(cardIdAtStep(route, 0)).toBe('n0');
    expect(cardIdAtStep(route, 2)).toBe('n2');
    expect(cardIdAtStep(route, 99)).toBe('n2');
    expect(stepAt(route, 1)?.target).toBe('n1');
  });
});
