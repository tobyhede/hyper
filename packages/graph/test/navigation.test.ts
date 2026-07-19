import { describe, expect, it } from 'vitest';
import type { PresentationPath } from '@project/core';
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

const path: PresentationPath = {
  id: 'main',
  title: 'Main',
  steps: [{ target: 'n0' }, { target: 'n1' }, { target: 'n2' }],
};

describe('path navigation', () => {
  it('counts steps', () => {
    expect(stepCount(path)).toBe(3);
  });

  it('clamps indices into range', () => {
    expect(clampStepIndex(path, -5)).toBe(0);
    expect(clampStepIndex(path, 99)).toBe(2);
    expect(clampStepIndex(path, 1)).toBe(1);
    expect(clampStepIndex(path, Number.NaN)).toBe(0);
  });

  it('walks forward and stops at the end', () => {
    expect(nextStepIndex(path, 0)).toBe(1);
    expect(nextStepIndex(path, 1)).toBe(2);
    expect(nextStepIndex(path, 2)).toBe(2);
  });

  it('walks backward and stops at the start', () => {
    expect(prevStepIndex(path, 2)).toBe(1);
    expect(prevStepIndex(path, 1)).toBe(0);
    expect(prevStepIndex(path, 0)).toBe(0);
  });

  it('reports edges of the range', () => {
    expect(canGoPrev(path, 0)).toBe(false);
    expect(canGoNext(path, 0)).toBe(true);
    expect(canGoPrev(path, 2)).toBe(true);
    expect(canGoNext(path, 2)).toBe(false);
  });

  it('resolves the target card id at a step', () => {
    expect(cardIdAtStep(path, 0)).toBe('n0');
    expect(cardIdAtStep(path, 2)).toBe('n2');
    expect(cardIdAtStep(path, 99)).toBe('n2');
    expect(stepAt(path, 1)?.target).toBe('n1');
  });
});
