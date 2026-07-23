import { describe, expect, it } from 'vitest';
import { loadSpace } from '@project/graph';
import fixtureJson from '../fixture/space.json';
import exampleJson from '../example/space.json';

/**
 * The two space files on disk, loaded exactly as authored.
 *
 * `layouts` and `defaultView` are additive (ADR 0013): every file written before
 * they existed must still load, and both of these declare neither. This is the
 * regression test for that — the fixture is separately proven by the app booting,
 * but `example/` is dormant and nothing else would notice it breaking.
 */

describe.each([
  ['fixture', fixtureJson],
  ['example', exampleJson],
])('%s/space.json', (_name, json) => {
  it('loads unchanged, declaring no layouts', () => {
    const result = loadSpace(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.layouts).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });
});
