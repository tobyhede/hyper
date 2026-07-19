import type { PathStep, PresentationPath } from '@project/core';

/**
 * Pure path-navigation helpers. All index-returning functions clamp to a valid
 * range so callers never land on an out-of-bounds step.
 */

export function stepCount(path: PresentationPath): number {
  return path.steps.length;
}

export function clampStepIndex(path: PresentationPath, index: number): number {
  const max = stepCount(path) - 1;
  if (Number.isNaN(index)) return 0;
  if (index < 0) return 0;
  if (index > max) return max;
  return Math.floor(index);
}

export function stepAt(path: PresentationPath, index: number): PathStep | undefined {
  return path.steps[index];
}

/** The card id targeted by the step at `index` (clamped). */
export function cardIdAtStep(path: PresentationPath, index: number): string | undefined {
  return stepAt(path, clampStepIndex(path, index))?.target;
}

export function canGoNext(path: PresentationPath, index: number): boolean {
  return index < stepCount(path) - 1;
}

export function canGoPrev(_path: PresentationPath, index: number): boolean {
  return index > 0;
}

export function nextStepIndex(path: PresentationPath, index: number): number {
  return clampStepIndex(path, index + 1);
}

export function prevStepIndex(path: PresentationPath, index: number): number {
  return clampStepIndex(path, index - 1);
}
