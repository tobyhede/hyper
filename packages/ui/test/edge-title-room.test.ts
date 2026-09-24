import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EDGE_TITLE_BOX_CHROME,
  EDGE_TITLE_CEILING,
  EDGE_TITLE_CLEARANCE,
  EDGE_TITLE_LEAST_TEXT,
  edgeTitleRoom,
} from '../src/edge-title-room';

/** The shortest span on which a Title still draws at rest. */
const THRESHOLD = EDGE_TITLE_CLEARANCE + EDGE_TITLE_BOX_CHROME + EDGE_TITLE_LEAST_TEXT;

const span = fc.double({ min: 0, max: 4000, noNaN: true });

describe('the room a Title has at rest on its Edge', () => {
  it('never runs past the Edge less its clearance, nor past the ceiling', () => {
    fc.assert(
      fc.property(span, (length) => {
        const room = edgeTitleRoom(length);
        if (room.kind === 'none') return;
        expect(room.width).toBeLessThanOrEqual(length - EDGE_TITLE_CLEARANCE);
        expect(room.width).toBeLessThanOrEqual(EDGE_TITLE_CEILING);
      }),
    );
  });

  it('draws nothing exactly when the box could not hold three characters and the ellipsis', () => {
    fc.assert(
      fc.property(span, (length) => {
        const room = edgeTitleRoom(length);
        expect(room.kind === 'none').toBe(length < THRESHOLD);
        if (room.kind === 'fitted') {
          expect(room.width - EDGE_TITLE_BOX_CHROME).toBeGreaterThanOrEqual(EDGE_TITLE_LEAST_TEXT);
        }
      }),
    );
  });

  it('gives a longer Edge at least as much room as a shorter one', () => {
    fc.assert(
      fc.property(span, span, (a, b) => {
        const [shorter, longer] = a <= b ? [a, b] : [b, a];
        const width = (length: number): number => {
          const room = edgeTitleRoom(length);
          return room.kind === 'none' ? 0 : room.width;
        };
        expect(width(longer)).toBeGreaterThanOrEqual(width(shorter));
      }),
    );
  });

  it('draws nothing on the short gap that read "If th…", and the ceiling on a long one', () => {
    expect(edgeTitleRoom(72)).toEqual({ kind: 'none' });
    expect(edgeTitleRoom(440)).toEqual({ kind: 'fitted', width: EDGE_TITLE_CEILING });
  });
});
