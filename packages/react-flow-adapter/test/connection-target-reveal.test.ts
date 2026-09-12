import { describe, expect, it } from 'vitest';
import { connectionTargetProximity } from '../src/connection-target-proximity';
import {
  CONNECTION_TARGET_PROXIMITY,
  connectionPointerInFlow,
  distanceToAabb,
  isNearConnectionTarget,
  offersConnectionEnd,
} from '../src/connection-target-reveal';

const rect = { x: 100, y: 200, width: 260, height: 146 };

describe('distanceToAabb', () => {
  it('is zero for a point inside the rect', () => {
    expect(distanceToAabb({ x: 150, y: 250 }, rect)).toBe(0);
  });

  it('is zero for a point on the boundary', () => {
    expect(distanceToAabb({ x: 100, y: 250 }, rect)).toBe(0);
  });

  it('is the gap to the nearest edge when clear on one axis', () => {
    expect(distanceToAabb({ x: 80, y: 250 }, rect)).toBe(20);
    expect(distanceToAabb({ x: 200, y: 160 }, rect)).toBe(40);
  });

  it('is the hypotenuse when clear of a corner', () => {
    expect(distanceToAabb({ x: 70, y: 170 }, rect)).toBe(Math.hypot(30, 30));
  });
});

describe('connectionPointerInFlow', () => {
  it('undoes the viewport pan and zoom', () => {
    expect(connectionPointerInFlow({ x: 200, y: 100 }, [40, 20, 2])).toEqual({
      x: 80,
      y: 40,
    });
  });
});

describe('isNearConnectionTarget', () => {
  it('uses CONNECTION_TARGET_PROXIMITY as the default radius', () => {
    expect(CONNECTION_TARGET_PROXIMITY).toBe(80);
    expect(isNearConnectionTarget({ x: 100 - 80, y: 250 }, rect)).toBe(true);
    expect(isNearConnectionTarget({ x: 100 - 81, y: 250 }, rect)).toBe(false);
  });
});

describe('offersConnectionEnd', () => {
  it('requires seeking, proximity and eligibility together', () => {
    expect(offersConnectionEnd({ seeking: 'target', near: true, eligible: true })).toBe(true);
    expect(offersConnectionEnd({ seeking: null, near: true, eligible: true })).toBe(false);
    expect(offersConnectionEnd({ seeking: 'target', near: false, eligible: true })).toBe(false);
    expect(offersConnectionEnd({ seeking: 'target', near: true, eligible: false })).toBe(false);
  });
});

describe('connectionTargetProximity', () => {
  it('is false while idle, without a pointer, or without bounds', () => {
    expect(connectionTargetProximity(false, { x: 100, y: 250 }, rect)).toBe(false);
    expect(connectionTargetProximity(true, null, rect)).toBe(false);
    expect(connectionTargetProximity(true, { x: 100, y: 250 }, null)).toBe(false);
  });

  it('treats a zero-size AABB as a point: near when within R, far beyond', () => {
    const point = { x: 100, y: 200, width: 0, height: 0 };
    expect(connectionTargetProximity(true, { x: 100, y: 200 }, point)).toBe(true);
    expect(
      connectionTargetProximity(true, { x: 100 - CONNECTION_TARGET_PROXIMITY, y: 200 }, point),
    ).toBe(true);
    expect(
      connectionTargetProximity(true, { x: 100 - CONNECTION_TARGET_PROXIMITY - 1, y: 200 }, point),
    ).toBe(false);
  });

  it('is true inside the magnet and false outside it', () => {
    expect(
      connectionTargetProximity(true, { x: 100 - CONNECTION_TARGET_PROXIMITY, y: 250 }, rect),
    ).toBe(true);
    expect(
      connectionTargetProximity(true, { x: 100 - CONNECTION_TARGET_PROXIMITY - 1, y: 250 }, rect),
    ).toBe(false);
  });
});
