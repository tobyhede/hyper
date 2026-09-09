import { describe, expect, it } from 'vitest';
import { nearestAlong, nearestEdge, type DockBox } from '../stories/review/dock-model';

/**
 * A 1200x800 viewport, which is the only container the Dock ever measures
 * against.
 */
const VIEWPORT: DockBox = { left: 0, top: 0, right: 1200, bottom: 800 };

/** A horizontal Dock: wide and shallow, as the strip actually is. */
const horizontal = (left: number, top: number): DockBox => ({
  left,
  top,
  right: left + 600,
  bottom: top + 44,
});

/**
 * Which edge a release lands on.
 *
 * **The claim under test is that a corner is reachable from either direction.**
 * It was once false, and the way it was false is the reason this function
 * measures gaps rather than centres: a horizontal Dock is ~600px wide, so its
 * centre sits ~300px from the left edge however far left it is dragged, while
 * that same centre can be 40px from the top. Centre distance therefore let the
 * Dock's own width vote, `top` won every time near the top-left, and no gesture
 * turned a top Dock into a left one there.
 *
 * So the test drags a *wide* Dock into the top-left and asks for `left`. A
 * narrow one would pass under either rule and prove nothing — the width is the
 * whole mechanism, and a fixture that removes it removes the bug.
 */
describe('the edge a release lands on', () => {
  it('is reachable at a corner from either direction, whatever the Dock is wide', () => {
    // Hard against the left, a little way down: the left gap is 4, the top gap
    // is 60. Under centre distance the centre sits 304 from the left and 82
    // from the top, so `top` would win and the left edge would be unreachable.
    expect(nearestEdge(VIEWPORT, horizontal(4, 60))).toBe('left');

    // The same corner approached the other way: hard against the top, a little
    // way in. Now the top gap is 4 and the left gap is 60.
    expect(nearestEdge(VIEWPORT, horizontal(60, 4))).toBe('top');
  });
});

/**
 * Which of the three stops along an edge a release lands on.
 *
 * **The same bug as the corner, one axis down.** A stop is a place the Dock
 * ends up, not a point on the edge: `start` puts a 600px-wide Dock's centre
 * 300px in, because the Dock has to fit. Measuring the Dock's centre against
 * the raw ends of the edge therefore asks it to be somewhere it can never be,
 * and the width votes again — a Dock shoved hard into the left of a 1200px
 * viewport has its centre at 304, which is nearer the middle stop at 600 than
 * the start stop at 0, so it snaps back to the centre it was dragged out of.
 *
 * The fixture is wide for the reason it was wide for `nearestEdge`: the width
 * is the mechanism, and a narrow Dock reaches `start` under either rule.
 */
describe('the stop along an edge a release lands on', () => {
  it('is the stop the Dock was dragged to, at every one of the three', () => {
    // Hard against the left. Centre at 304; the start stop is at 300 and the
    // middle at 600. Under the old rule the middle won and the Dock snapped
    // back out of the corner it had been dragged into.
    expect(nearestAlong(VIEWPORT, horizontal(4, 60), 'top')).toBe('start');

    // Centred: 300 of slack either side, so its centre is the container's.
    expect(nearestAlong(VIEWPORT, horizontal(300, 60), 'top')).toBe('center');

    // Hard against the right, the mirror of the first.
    expect(nearestAlong(VIEWPORT, horizontal(596, 60), 'top')).toBe('end');
  });

  it('reads the axis of the edge, so a side Dock is measured down the viewport', () => {
    // The same three answers on a vertical edge, where the stops run top to
    // bottom and the Dock's height is what has to fit. Nothing else about the
    // arithmetic changes, which is why one function serves both.
    const vertical = (top: number): DockBox => ({ left: 16, top, right: 224, bottom: top + 400 });

    expect(nearestAlong(VIEWPORT, vertical(4), 'left')).toBe('start');
    expect(nearestAlong(VIEWPORT, vertical(200), 'left')).toBe('center');
    expect(nearestAlong(VIEWPORT, vertical(396), 'left')).toBe('end');
  });
});
