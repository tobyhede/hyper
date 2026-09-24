import { describe, expect, it } from 'vitest';
import {
  DOCK_ALONGS,
  DOCK_EDGES,
  alongLabel,
  dockStyle,
  EDGE_LABEL,
  exceedsDragThreshold,
  MENU_SIDE,
  nearestSlot,
  slotLabel,
  type DockBox,
} from '../src/dock-placement';

/** The container the Dock measures against. */
const VIEWPORT: DockBox = { left: 0, top: 0, right: 1200, bottom: 800 };

/** A horizontal Dock, 600 wide and 44 deep, at a given top-left corner. */
const horizontal = (left: number, top: number): DockBox => ({
  left,
  top,
  right: left + 600,
  bottom: top + 44,
});

describe('the slot a release lands in', () => {
  it('answers the nearest edge, then the nearest stop along it', () => {
    expect(nearestSlot(VIEWPORT, horizontal(4, 60))).toEqual({ edge: 'left', along: 'start' });
    expect(nearestSlot(VIEWPORT, horizontal(300, 4))).toEqual({ edge: 'top', along: 'center' });
    expect(nearestSlot(VIEWPORT, horizontal(590, 754))).toEqual({ edge: 'bottom', along: 'end' });
  });
});

describe('where a docked position is drawn', () => {
  it('holds the Dock off its own edge, and further off the bottom', () => {
    expect(dockStyle({ edge: 'top', along: 'start' })).toEqual({ top: 16, left: 16 });
    expect(dockStyle({ edge: 'bottom', along: 'end' })).toEqual({ bottom: 44, right: 16 });
    expect(dockStyle({ edge: 'left', along: 'start' })).toEqual({ left: 16, top: 16 });
    expect(dockStyle({ edge: 'right', along: 'end' })).toEqual({ right: 16, bottom: 44 });
  });

  it('centres by its own midpoint, and only at the centre stop', () => {
    expect(dockStyle({ edge: 'top', along: 'center' })).toEqual({
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
    });
    expect(dockStyle({ edge: 'right', along: 'center' })).toEqual({
      right: 16,
      top: '50%',
      transform: 'translateY(-50%)',
    });
  });
});

describe('which way a menu opens', () => {
  it('opens into the canvas, away from the edge the Dock is against', () => {
    expect(MENU_SIDE).toEqual({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' });
  });
});

describe('how a slot is named', () => {
  it('names each stop for the direction its edge runs', () => {
    expect(alongLabel('top', 'start')).toBe('Left');
    expect(alongLabel('bottom', 'center')).toBe('Centre');
    expect(alongLabel('left', 'start')).toBe('Top');
    expect(alongLabel('right', 'center')).toBe('Middle');
    expect(alongLabel('right', 'end')).toBe('Bottom');
  });

  it('says where the Dock is the way the grip label reads it', () => {
    expect(slotLabel({ edge: 'bottom', along: 'center' })).toBe('Bottom edge, centre');
    expect(slotLabel({ edge: 'left', along: 'end' })).toBe('Left edge, bottom');
  });

  it('labels every edge, and every one of the twelve slots distinctly', () => {
    expect(DOCK_EDGES.map((edge) => EDGE_LABEL[edge])).toEqual([
      'Top edge',
      'Right edge',
      'Bottom edge',
      'Left edge',
    ]);
    const labels = DOCK_EDGES.flatMap((edge) =>
      DOCK_ALONGS.map((along) => slotLabel({ edge, along })),
    );
    expect(new Set(labels).size).toBe(12);
  });
});

describe('when a press becomes a drag', () => {
  const from = { x: 100, y: 100 };

  it('stays a click within four pixels on both axes', () => {
    expect(exceedsDragThreshold(from, { x: 100, y: 100 })).toBe(false);
    expect(exceedsDragThreshold(from, { x: 104, y: 96 })).toBe(false);
  });

  it('becomes a drag past four pixels on either axis', () => {
    expect(exceedsDragThreshold(from, { x: 105, y: 100 })).toBe(true);
    expect(exceedsDragThreshold(from, { x: 100, y: 95 })).toBe(true);
  });
});
