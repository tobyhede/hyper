import type { Route, RouteStep } from '@project/core';

/**
 * Pure route-navigation helpers. All index-returning functions clamp to a valid
 * range so callers never land on an out-of-bounds step.
 */

export function stepCount(route: Route): number {
  return route.steps.length;
}

export function clampStepIndex(route: Route, index: number): number {
  const max = stepCount(route) - 1;
  if (Number.isNaN(index)) return 0;
  if (index < 0) return 0;
  if (index > max) return max;
  return Math.floor(index);
}

export function stepAt(route: Route, index: number): RouteStep | undefined {
  return route.steps[index];
}

/** The card id targeted by the step at `index` (clamped). */
export function cardIdAtStep(route: Route, index: number): string | undefined {
  return stepAt(route, clampStepIndex(route, index))?.target;
}

export function canGoNext(route: Route, index: number): boolean {
  return index < stepCount(route) - 1;
}

export function canGoPrev(_route: Route, index: number): boolean {
  return index > 0;
}

export function nextStepIndex(route: Route, index: number): number {
  return clampStepIndex(route, index + 1);
}

export function prevStepIndex(route: Route, index: number): number {
  return clampStepIndex(route, index - 1);
}
