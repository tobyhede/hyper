import { describe, expect, it } from 'vitest';
import { orientationOf } from '../stories/review/dock-model';

/**
 * The axis each edge puts the Dock on.
 *
 * One fact, and everything the surface draws hangs off it: whether the clusters
 * run or stack, whether a stop is named Left/Centre/Right or Top/Middle/Bottom,
 * which inset holds the Dock off a corner, and which way a menu opens.
 *
 * The test names all four edges rather than the two pairs. A rule stated as
 * "left and right are vertical" is the implementation written twice; naming
 * each edge is what a reader checks the arrangement against.
 *
 * **That an edge cannot fall through is not asserted here, because it cannot
 * be.** A missing edge is a missing key in a total record, so it never reaches
 * a test run — `tsc` rejects it first, which is the whole reason the ternary
 * became a record. A run-time assertion for it would have to compare against
 * `undefined`, a value the return type does not admit; the first draft of this
 * test did exactly that and lint called it what it was, a condition whose types
 * have no overlap. Coverage is the compiler's; these four are the answers.
 */
describe('the axis of a docked edge', () => {
  it('is named for every edge, and the two axes are the two pairs', () => {
    expect(orientationOf('top')).toBe('horizontal');
    expect(orientationOf('bottom')).toBe('horizontal');
    expect(orientationOf('left')).toBe('vertical');
    expect(orientationOf('right')).toBe('vertical');
  });
});
