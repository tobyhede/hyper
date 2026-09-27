import { describe, expect, it } from 'vitest';
import {
  COLLAPSED_RESOURCE_SIZE,
  DEFAULT_OPEN_SIZE,
  OPEN_RESOURCE_CHROME,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot, SnapshotEdit, type SnapshotEditOutcome } from '../src/index';
import { uuid } from './resource-files';

/**
 * What an Image Resource first Opens to (ADR 0106, ADR 0107): its recorded
 * natural size at one pixel per canvas unit, scaled down to fit 1280×960, plus
 * the Open Markdown front's chrome, and never smaller than the Closed size.
 */

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const MAP_ID = uuid('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000003');
const IMAGE_ID = uuid('00000000-0000-4000-8000-000000000004');
const NEIGHBOUR_ID = uuid('00000000-0000-4000-8000-000000000005');

const snapshotWith = (naturalSize?: { width: number; height: number }): SpaceSnapshot => ({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Pictures',
    defaultMap: MAP_ID,
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [IMAGE_ID]: { x: 0, y: 0, open: false },
          [NEIGHBOUR_ID]: { x: 300, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
  },
  resources: [
    {
      id: IMAGE_ID,
      document:
        naturalSize === undefined
          ? { title: 'Harbour', kind: 'image', url: 'https://example.com/harbour.png' }
          : {
              title: 'Harbour',
              kind: 'image',
              url: 'https://example.com/harbour.png',
              naturalSize,
            },
    },
    { id: NEIGHBOUR_ID, document: { title: 'Beside', kind: 'markdown', body: '' } },
  ],
});

const completed = (outcome: SnapshotEditOutcome): SpaceSnapshot => {
  if (outcome.kind !== 'completed') throw new Error(`Expected completed, got ${outcome.kind}`);
  expect(loadSpaceSnapshot(outcome.snapshot).ok).toBe(true);
  return outcome.snapshot;
};

const placement = (snapshot: SpaceSnapshot, id: typeof IMAGE_ID) => {
  const at = snapshot.document.maps?.[0]?.positions[id];
  if (at === undefined) throw new Error('not placed');
  return at;
};

const openSizeOf = (snapshot: SpaceSnapshot) => {
  const at = placement(snapshot, IMAGE_ID);
  if (!at.open) throw new Error('not open');
  return at.openSize;
};

/** The content area an Open Size leaves once the chrome is taken from it. */
const contentArea = (size: { width: number; height: number }) => ({
  width: size.width - OPEN_RESOURCE_CHROME.width,
  height: size.height - OPEN_RESOURCE_CHROME.height,
});

describe('the first Open of an Image Resource', () => {
  it('holds a recorded 400×300 at its own size', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 400, height: 300 }), MAP_ID, IMAGE_ID),
    );
    expect(contentArea(openSizeOf(opened))).toEqual({ width: 400, height: 300 });
  });

  it('scales a 4000×3000 image down to 1280×960', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 4000, height: 3000 }), MAP_ID, IMAGE_ID),
    );
    expect(contentArea(openSizeOf(opened))).toEqual({ width: 1280, height: 960 });
  });

  it('scales proportionally on the axis that binds: a 2560×480 panorama keeps its ratio', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 2560, height: 480 }), MAP_ID, IMAGE_ID),
    );
    expect(contentArea(openSizeOf(opened))).toEqual({ width: 1280, height: 240 });
  });

  it('opens a 16×16 image at the Closed size, never smaller', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 16, height: 16 }), MAP_ID, IMAGE_ID),
    );
    expect(openSizeOf(opened)).toEqual(COLLAPSED_RESOURCE_SIZE);
  });

  it('keeps each axis at least the Closed size on its own', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 900, height: 20 }), MAP_ID, IMAGE_ID),
    );
    expect(openSizeOf(opened)).toEqual({
      width: 900 + OPEN_RESOURCE_CHROME.width,
      height: COLLAPSED_RESOURCE_SIZE.height,
    });
  });

  it('opens at the default Open Size with no recorded natural size', () => {
    const opened = completed(SnapshotEdit.open(snapshotWith(), MAP_ID, IMAGE_ID));
    expect(openSizeOf(opened)).toEqual(DEFAULT_OPEN_SIZE);
  });

  it('moves the neighbour it grows past by that size, in the same Edit', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 400, height: 300 }), MAP_ID, IMAGE_ID),
    );
    const growth = openSizeOf(opened).width - COLLAPSED_RESOURCE_SIZE.width;
    expect(placement(opened, NEIGHBOUR_ID)).toMatchObject({ x: 300 + growth, y: 0 });
  });

  it('returns to the remembered Open Size on reopening, not a new measurement', () => {
    const opened = completed(
      SnapshotEdit.open(snapshotWith({ width: 400, height: 300 }), MAP_ID, IMAGE_ID),
    );
    const resized = completed(
      SnapshotEdit.resize(opened, MAP_ID, IMAGE_ID, { width: 700, height: 500 }),
    );
    const closed = completed(SnapshotEdit.close(resized, MAP_ID, IMAGE_ID));
    const reopened = completed(SnapshotEdit.open(closed, MAP_ID, IMAGE_ID));
    expect(openSizeOf(reopened)).toEqual({ width: 700, height: 500 });
  });
});
