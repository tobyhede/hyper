import { afterEach, describe, expect, it, vi } from 'vitest';
import { newUuid, uuidSchema, type SpaceSnapshot } from '@project/core';
import { productDestinationPath } from '@project/http';
import { MemorySpaceBackend } from '@project/persistence';
import { createSpaceStartup } from '../src/space';
import { recordingHistory } from './browser-history';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const IMAGE_URL = 'https://example.test/never-answers.png';

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'Measurement' },
  resources: [{ id: RESOURCE_ID, document: { kind: 'markdown', title: 'Notes', body: '' } }],
};

/** Browser image events are held while the real startup supplies its image sources. */
class HeldImage {
  src = '';
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

async function browserMeasurement() {
  const picture = new HeldImage();
  vi.stubGlobal(
    'Image',
    vi.fn(function Image() {
      return picture;
    }),
  );
  const backend = MemorySpaceBackend.asMeta({
    snapshot,
    revision: 0n,
    exportedRevision: null,
  });
  const startup = createSpaceStartup(backend, newUuid, recordingHistory());
  const { opened } = await startup.resolve(
    productDestinationPath({ kind: 'space', spaceId: SPACE_ID }),
  );
  vi.useFakeTimers();
  return { picture, measure: opened.images.measure };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the browser image measurement budget', () => {
  it('waits for ten seconds before answering without a natural size', async () => {
    const { picture, measure } = await browserMeasurement();
    const settled = vi.fn();
    const pending = measure(IMAGE_URL);
    void pending.then(settled);

    expect(picture.src).toBe(IMAGE_URL);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(undefined);
    expect(picture.onload).toBeNull();
    expect(picture.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('answers without a natural size immediately on a load error and clears the timeout', async () => {
    const { picture, measure } = await browserMeasurement();
    const pending = measure(IMAGE_URL);

    expect(picture.onerror).not.toBeNull();
    picture.onerror?.();

    await expect(pending).resolves.toBeUndefined();
    expect(picture.onload).toBeNull();
    expect(picture.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
