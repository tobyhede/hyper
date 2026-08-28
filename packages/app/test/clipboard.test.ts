import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIPBOARD_REFUSAL, copyLink } from '../src/clipboard';

/** The part of `navigator` these tests stand in for. */
interface NavigatorStub {
  readonly clipboard?: { readonly writeText: (value: string) => Promise<void> } | undefined;
}

const withNavigator = (value: NavigatorStub): void => {
  vi.stubGlobal('navigator', value);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyLink', () => {
  it('answers the refusal rather than throwing when the Clipboard API is absent', async () => {
    // `navigator.clipboard` is undefined outside a secure context — a dev
    // server reached over a LAN address rather than localhost.
    withNavigator({});

    await expect(copyLink('http://192.168.1.5:5173/spaces/x')).resolves.toBe(CLIPBOARD_REFUSAL);
  });

  it('answers the refusal when the browser rejects the write', async () => {
    withNavigator({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });

    await expect(copyLink('http://localhost:5173/spaces/x')).resolves.toBe(CLIPBOARD_REFUSAL);
  });

  it('writes the link and answers no refusal', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    withNavigator({ clipboard: { writeText } });

    await expect(copyLink('http://localhost:5173/spaces/x')).resolves.toBeNull();
    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/spaces/x');
  });
});
