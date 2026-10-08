import { describe, expect, it, vi } from 'vitest';
import { createBrowserFullscreen, type NativeFullscreenDocument } from '../src/browser-fullscreen';

/** A stand-in document whose Fullscreen API answers what the test says. */
function standInDocument(
  requestFullscreen: (() => Promise<void>) | undefined,
  exitFullscreen: () => Promise<void> = () => Promise.resolve(),
) {
  const listeners = new Set<() => void>();
  let fullscreenElement: object | null = null;
  const native = {
    documentElement: { requestFullscreen },
    get fullscreenElement() {
      return fullscreenElement;
    },
    exitFullscreen: vi.fn(exitFullscreen),
    addEventListener: (_type: 'fullscreenchange', listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'fullscreenchange', listener: () => void) => {
      listeners.delete(listener);
    },
  } satisfies NativeFullscreenDocument;
  const fire = () => {
    for (const listener of [...listeners]) listener();
  };
  /** The browser puts the document into fullscreen. */
  const goFullscreen = () => {
    fullscreenElement = {};
  };
  return { native, fire, goFullscreen };
}

describe('createBrowserFullscreen', () => {
  it('requests fullscreen on the whole document and answers that it was entered', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const { native } = standInDocument(requestFullscreen);

    await expect(createBrowserFullscreen(native).enter()).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('answers a refused request rather than rejecting', async () => {
    const { native } = standInDocument(() =>
      Promise.reject(new TypeError('Permissions check failed')),
    );

    await expect(createBrowserFullscreen(native).enter()).resolves.toBe(false);
  });

  it('answers a request that throws synchronously, or a missing API, as refused', async () => {
    const throwing = standInDocument(() => {
      throw new TypeError('not allowed');
    });
    const missing = standInDocument(undefined);

    await expect(createBrowserFullscreen(throwing.native).enter()).resolves.toBe(false);
    await expect(createBrowserFullscreen(missing.native).enter()).resolves.toBe(false);
  });

  it('reads whether the document is fullscreen', () => {
    const { native, goFullscreen } = standInDocument(() => Promise.resolve());
    const fullscreen = createBrowserFullscreen(native);

    expect(fullscreen.active()).toBe(false);
    goFullscreen();
    expect(fullscreen.active()).toBe(true);
  });

  it('exits only a fullscreen that is on, and swallows a refused exit', async () => {
    const { native, goFullscreen } = standInDocument(
      () => Promise.resolve(),
      () => Promise.reject(new TypeError('Document not active')),
    );
    const fullscreen = createBrowserFullscreen(native);

    fullscreen.exit();
    expect(native.exitFullscreen).not.toHaveBeenCalled();

    goFullscreen();
    fullscreen.exit();
    expect(native.exitFullscreen).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it('notifies on fullscreenchange until unsubscribed', () => {
    const { native, fire } = standInDocument(() => Promise.resolve());
    const listener = vi.fn();
    const unsubscribe = createBrowserFullscreen(native).subscribe(listener);

    fire();
    unsubscribe();
    fire();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
