import { describe, expect, it } from 'vitest';
import {
  authoredFromDrawn,
  embedCamera,
  framingFromFit,
  panFraming,
  viewportFromFraming,
  zoomFraming,
} from '../src/space-resource-framing';

const bounds = { left: 16, top: 16, right: 416, bottom: 316 };
const origin = { x: 80, y: 60 };

describe('Space Resource portal framing', () => {
  it('fits from the Map origin when nothing has been framed yet', () => {
    expect(embedCamera(bounds, origin, undefined)).toEqual({
      offset: { x: -64, y: -44 },
      zoom: 1,
    });
  });

  it('places the stored centre at the window midpoint at the stored zoom', () => {
    const camera = embedCamera(bounds, origin, { centreX: 200, centreY: 100, zoom: 2 });
    expect(camera.zoom).toBe(2);
    expect(camera.offset).toEqual({ x: 16 + 200 - 400, y: 16 + 150 - 200 });
    expect(
      authoredFromDrawn(
        { x: camera.offset.x + 200 * 2, y: camera.offset.y + 100 * 2 },
        camera.offset,
        2,
      ),
    ).toEqual({
      x: 200,
      y: 100,
    });
  });

  it('pans without rewriting the zoom, and zooming keeps the centre', () => {
    const fitted = framingFromFit(origin, bounds);
    expect(fitted).toEqual({ centreX: 280, centreY: 210, zoom: 1 });
    expect(panFraming(fitted, { x: 40, y: -10 })).toEqual({
      centreX: 240,
      centreY: 220,
      zoom: 1,
    });
    expect(zoomFraming(fitted, 2)).toEqual({ centreX: 280, centreY: 210, zoom: 2 });
  });

  it('builds an entered viewport from the browser canvas size, not the source Resource', () => {
    expect(viewportFromFraming({ centreX: 200, centreY: 100, zoom: 2 }, 1280, 720)).toEqual({
      x: 640 - 400,
      y: 360 - 200,
      zoom: 2,
    });
  });
});
