import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type MapId } from '@project/core';
import type { OpenSpace } from '../src/open-spaces';
import { useResourcePlacement } from '../src/resource-placement';
import {
  MAP_ID,
  OTHER_MAP_ID,
  derivationSpace,
  openDerivationSpace,
} from './app-derivation-fixtures';
import { heldImageSources } from './image-sources';
import { mintingIds } from './minting';

/**
 * The Image Resource gestures `useResourcePlacement` offers, driven while the
 * picture they bring is still being measured.
 */

const CREATED = uuidSchema.parse('00000000-0000-4000-8000-0000000000e1');
const URL = 'https://example.com/a.png';
const AT = { x: 30, y: 40 };

const drawnMap = () => {
  const resolved = derivationSpace().lookup.map(MAP_ID);
  if (resolved === undefined) throw new Error('The fixture has no drawn Map.');
  return resolved.map;
};

const place = (opened: OpenSpace) =>
  renderHook(() =>
    useResourcePlacement(opened, {
      map: drawnMap(),
      presenting: false,
      replacementEpoch: 0,
      reportBreak: () => undefined,
    }),
  );

const placedIn = (opened: OpenSpace, mapId: MapId): readonly string[] =>
  Object.keys(
    opened.session.getState().working.document.maps?.find(({ id }) => id === mapId)?.positions ??
      {},
  );

/** Settle every promise the gesture chained on the answer. */
const settled = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('an Image Resource gesture the author moves away from', () => {
  it('places the Resource on the Map it was made on, and owes no Title on the Map drawn now', async () => {
    const measuring = heldImageSources();
    const opened = openDerivationSpace(mintingIds(CREATED), measuring.images);
    const { result } = place(opened);

    act(() => result.current.pasteImageUrl(URL, AT));
    await settled();
    act(() => opened.app.navigation.selectMap(OTHER_MAP_ID));
    measuring.release();
    await settled();

    expect(placedIn(opened, MAP_ID)).toContain(CREATED);
    expect(placedIn(opened, OTHER_MAP_ID)).not.toContain(CREATED);
    expect(opened.app.navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
    expect(opened.app.continuation.getState().pending).toBeNull();
  });

  it('continues in the Title while the Map it was made on is still drawn', async () => {
    const measuring = heldImageSources();
    const opened = openDerivationSpace(mintingIds(CREATED), measuring.images);
    const { result } = place(opened);

    act(() => result.current.pasteImageUrl(URL, AT));
    measuring.release();
    await settled();

    expect(placedIn(opened, MAP_ID)).toContain(CREATED);
    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });
});

describe('an Image Resource gesture that brought no files', () => {
  it('leaves a gesture still in flight to settle', async () => {
    const measuring = heldImageSources();
    const opened = openDerivationSpace(mintingIds(CREATED), measuring.images);
    const { result } = place(opened);

    act(() => result.current.pasteImageUrl(URL, AT));
    act(() => result.current.createImagesFromFiles([]));
    act(() => result.current.dropImages([], AT));
    measuring.release();
    await settled();

    expect(opened.app.continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });
});
