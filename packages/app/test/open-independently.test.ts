import { afterEach, describe, expect, it, vi } from 'vitest';
import { openIndependently } from '../src/open-independently';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openIndependently', () => {
  it('answers false rather than throwing when open is absent', () => {
    vi.stubGlobal('open', undefined);

    expect(openIndependently('https://space.test/spaces/x')).toBe(false);
  });

  it('treats a null return as opened, which noopener always answers', () => {
    const open = vi.fn(() => null);
    vi.stubGlobal('open', open);

    expect(openIndependently('https://space.test/spaces/x')).toBe(true);
    expect(open).toHaveBeenCalledWith(
      'https://space.test/spaces/x',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens the address in a new browsing context', () => {
    const open = vi.fn(() => ({ closed: false }));
    vi.stubGlobal('open', open);

    expect(openIndependently('https://space.test/spaces/x')).toBe(true);
    expect(open).toHaveBeenCalledWith(
      'https://space.test/spaces/x',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('answers false when open throws', () => {
    vi.stubGlobal('open', () => {
      throw new Error('blocked');
    });

    expect(openIndependently('https://space.test/spaces/x')).toBe(false);
  });
});
