import { describe, expect, it } from 'vitest';
import { resolveMountSource } from '../src/mount/mount-source';

const PINNED = `github:tobyhede/talk@${'a'.repeat(40)}/slides`;
const LATER = `github:tobyhede/talk@${'b'.repeat(40)}/slides`;

describe('where a mounted page gets its GitHub location', () => {
  it('mounts the source parameter over the build-time default', () => {
    expect(resolveMountSource(PINNED, LATER)).toEqual({
      kind: 'mount',
      from: 'parameter',
      location: { owner: 'tobyhede', repo: 'talk', ref: 'a'.repeat(40), path: 'slides' },
    });
  });

  it('mounts the build-time default when the address has no source', () => {
    expect(resolveMountSource(null, 'github:tobyhede/talk')).toEqual({
      kind: 'mount',
      from: 'default',
      location: { owner: 'tobyhede', repo: 'talk', ref: undefined, path: '' },
    });
  });

  it('asks for a location when there is neither', () => {
    expect(resolveMountSource(null, undefined)).toEqual({ kind: 'ask', failure: null });
  });

  it('asks again, saying why, when the source parameter is not a GitHub location', () => {
    expect(resolveMountSource('tobyhede/talk', LATER)).toEqual({
      kind: 'ask',
      failure: {
        kind: 'malformed-location',
        input: 'tobyhede/talk',
        reason: 'a GitHub location begins with github:',
      },
    });
  });

  it('asks, saying why, when the build-time default is not a GitHub location', () => {
    expect(resolveMountSource(null, 'github:tobyhede')).toEqual({
      kind: 'ask',
      failure: {
        kind: 'malformed-location',
        input: 'github:tobyhede',
        reason: 'a GitHub location names owner/repo',
      },
    });
  });

  /**
   * A copied URL carries the commit the reader was looking at, so moving the
   * deployment's default to a later commit does not move what it opens, and
   * the bare domain opens the later one.
   */
  it('keeps a copied commit after the deployment default moves on', () => {
    const copied = resolveMountSource(PINNED, LATER);
    const bare = resolveMountSource(null, LATER);

    expect(copied.kind === 'mount' && copied.location.ref).toBe('a'.repeat(40));
    expect(bare.kind === 'mount' && bare.location.ref).toBe('b'.repeat(40));
  });
});
