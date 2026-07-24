import { describe, expect, it } from 'vitest';
import { loadSpace, type CardFile } from '@project/graph';
import fixtureJson from '../fixture/space.json';
import exampleJson from '../example/space.json';

/**
 * The two spaces on disk, loaded exactly as authored.
 *
 * A space is now a directory, not a file (ADR 0020): the space file holds
 * structure, and every card is a markdown file beside it or under `cards/`. So
 * this reads both locations the same way the app does, and is the regression
 * test that the card files are still authored correctly — a missing fence or an
 * unquoted title in a card's frontmatter fails here.
 *
 * `layouts` and `defaultView` are additive (ADR 0013): every file written before
 * they existed must still load, and both of these declare neither. The fixture is
 * separately proven by the app booting, but `example/` is dormant and nothing
 * else would notice it breaking.
 */

const spaceDirs = import.meta.glob<string>(['../fixture/**/*.md', '../example/**/*.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The card files of one space directory, keyed the way the plugin serves them. */
function cardFiles(dir: string): CardFile[] {
  return Object.entries(spaceDirs)
    .filter(([path]) => path.startsWith(`../${dir}/`))
    .map(([path, text]) => ({ path, text }));
}

describe.each([
  ['fixture', fixtureJson, 10],
  ['example', exampleJson, 7],
])('%s/', (name, json, cardCount) => {
  it('loads unchanged, declaring no layouts', () => {
    const result = loadSpace(json, cardFiles(name));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.layouts).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });

  it('finds every card, each carrying its own body', () => {
    const result = loadSpace(json, cardFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.cards).toHaveLength(cardCount);
    // An alias shows its target's content, so its own body is empty (ADR 0009);
    // every other card carries one.
    for (const card of result.space.cards) {
      if (card.kind === 'alias') expect(card.body).toBe('');
      else expect(card.body.trim().length).toBeGreaterThan(0);
    }
  });
});
