import { describe, expect, it } from 'vitest';
import { formatGitHubLocation, parseGitHubLocation } from '../src/mount/github-location';

describe('parseGitHubLocation', () => {
  it('reads owner, repository, ref and path', () => {
    expect(parseGitHubLocation('github:tobyhede/hyper@main/talks/pgdu')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'hyper', ref: 'main', path: 'talks/pgdu' },
    });
  });

  it('leaves a missing ref and path to their defaults', () => {
    expect(parseGitHubLocation('github:tobyhede/hyper')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'hyper', ref: undefined, path: '' },
    });
    expect(parseGitHubLocation('github:tobyhede/hyper@v1.0')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'hyper', ref: 'v1.0', path: '' },
    });
    expect(parseGitHubLocation('github:tobyhede/hyper/talks')).toEqual({
      ok: true,
      location: { owner: 'tobyhede', repo: 'hyper', ref: undefined, path: 'talks' },
    });
  });

  it('ends a ref at the next slash, so a slashed branch is addressed by SHA or tag', () => {
    expect(parseGitHubLocation('github:o/r@feature/x/talk')).toEqual({
      ok: true,
      location: { owner: 'o', repo: 'r', ref: 'feature', path: 'x/talk' },
    });
  });

  it.each([
    ['', 'no scheme'],
    ['tobyhede/hyper', 'no scheme'],
    ['gitlab:tobyhede/hyper', 'another scheme'],
    ['github:', 'no owner'],
    ['github:tobyhede', 'no repository'],
    ['github:tobyhede/', 'an empty repository'],
    ['github:/hyper', 'an empty owner'],
    ['github:toby_hede/hyper', 'an owner GitHub cannot name'],
    ['github:tobyhede/..', 'a dot repository'],
    ['github:tobyhede/hyper@', 'an empty ref'],
    ['github:tobyhede/hyper@main/', 'an empty path segment'],
    ['github:tobyhede/hyper@main/talks//pgdu', 'an empty path segment'],
    ['github:tobyhede/hyper@main/../secrets', 'a parent segment'],
    ['github:tobyhede/hyper@main/./talks', 'a current-directory segment'],
    ['github:tobyhede/hyper@ma in', 'whitespace in the ref'],
  ])('refuses %j (%s)', (input) => {
    const parsed = parseGitHubLocation(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.failure).toMatchObject({ kind: 'malformed-location', input });
  });
});

describe('formatGitHubLocation', () => {
  it('writes a resolved location back in the syntax it is parsed from', () => {
    const sha = 'a'.repeat(40);
    expect(formatGitHubLocation({ owner: 'o', repo: 'r', sha, path: 'talks/pgdu' })).toBe(
      `github:o/r@${sha}/talks/pgdu`,
    );
    expect(formatGitHubLocation({ owner: 'o', repo: 'r', sha, path: '' })).toBe(
      `github:o/r@${sha}`,
    );
  });
});
