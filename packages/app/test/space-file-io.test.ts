import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CARD_ID,
  cardPathById,
  frontmatterId,
  fromLoopback,
  parseSavedSpace,
  readCardFiles,
  writeIfChanged,
  writeSpace,
} from '../space-file-io';

/**
 * The save endpoint's boundary, tested.
 *
 * None of this had a test before: it lived inside a Vite config module, so the
 * one control standing between a `PUT` and an arbitrary file write was reachable
 * only by starting a dev server and aiming a request at it. These are the
 * guarantees the surrounding comments claim, asserted.
 */

const spaceFile = {
  version: 1 as const,
  id: 'a-space',
  title: 'A space',
  routes: [],
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'space-io-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A card file as it sits on disk: frontmatter, then body (ADR 0020). */
const cardFile = (id: string, body = 'Body.') => `---\nid: ${id}\ntitle: ${id}\n---\n\n${body}\n`;

describe('CARD_ID', () => {
  // An id becomes a filename, so this is the control. Each of these would be a
  // write outside the space directory if it were merely screened for '..'.
  it.each([
    ['traversal', '../../../../etc/passwd'],
    ['nested traversal', 'cards/../../x'],
    ['encoded traversal', '..%2f..%2fetc%2fpasswd'],
    ['interior traversal', 'a/../../b'],
    ['absolute path', '/etc/passwd'],
    ['windows path', 'C:\\Windows\\system32'],
    ['dotfile path', '.ssh/authorized_keys'],
    ['bare dots', '..'],
    ['null byte', 'a\u0000b'],
    ['newline', 'a\nb'],
    ['carriage return', 'a\rb'],
    ['empty', ''],
    ['leading dash', '-leading'],
    ['extension', 'x.md'],
    ['dot', 'a.b'],
    ['space', 'a b'],
    ['over length (65)', 'a'.repeat(65)],
  ])('rejects %s', (_label, id) => {
    expect(CARD_ID.test(id)).toBe(false);
  });

  it.each([
    ['a bare slug', 'intro'],
    ['digits and dashes', 'card-2'],
    ['underscores', 'Card_1-x'],
    ['a single character', 'a'],
    ['exactly 64 characters', 'a'.repeat(64)],
  ])('accepts %s', (_label, id) => {
    expect(CARD_ID.test(id)).toBe(true);
  });
});

describe('parseSavedSpace', () => {
  it('returns zod\u2019s stripped output, not what arrived', () => {
    const parsed = parseSavedSpace({
      spaceFile: { ...spaceFile, evil: { nested: 'x' }, scripts: { postinstall: 'sh' } },
      cards: [],
    });

    expect(parsed).not.toBeNull();
    // The whole point of validating: keys nobody declared do not reach disk.
    expect(parsed?.spaceFile).not.toHaveProperty('evil');
    expect(parsed?.spaceFile).not.toHaveProperty('scripts');
    expect(parsed?.spaceFile).toMatchObject({ id: 'a-space', title: 'A space' });
  });

  it('rejects a payload whose card id is not a slug', () => {
    expect(parseSavedSpace({ spaceFile, cards: [{ id: '../evil', text: 'x' }] })).toBeNull();
  });

  it('rejects a space file that fails the schema', () => {
    expect(parseSavedSpace({ spaceFile: { version: 99 }, cards: [] })).toBeNull();
  });

  it.each([
    ['a non-object', 'nope'],
    ['null', null],
    ['a missing cards array', { spaceFile }],
    ['cards that are not objects', { spaceFile, cards: ['x'] }],
    ['a card whose text is not a string', { spaceFile, cards: [{ id: 'a', text: 1 }] }],
  ])('rejects %s', (_label, value) => {
    expect(parseSavedSpace(value)).toBeNull();
  });

  it('accepts a well-formed payload', () => {
    const parsed = parseSavedSpace({ spaceFile, cards: [{ id: 'intro', text: 'hello' }] });
    expect(parsed?.cards).toEqual([{ id: 'intro', text: 'hello' }]);
  });
});

describe('fromLoopback', () => {
  it.each([
    ['no origin at all — not a browser', undefined],
    ['localhost', 'http://localhost:5173'],
    ['127.0.0.1', 'http://127.0.0.1:5173'],
    ['another loopback address', 'http://127.1.2.3:5173'],
    ['IPv6 loopback', 'http://[::1]:5173'],
  ])('allows %s', (_label, origin) => {
    expect(fromLoopback(origin)).toBe(true);
  });

  it.each([
    ['a rebinding attacker\u2019s own origin', 'http://evil.example:5173'],
    ['a lookalike hostname', 'http://localhost.evil.example'],
    // An attacker registers this under a domain they control and points it at
    // 127.0.0.1. A `startsWith('127.')` test accepted it, which defeated the
    // guard entirely \u2014 the one page it exists to refuse looked local.
    ['a hostname that merely begins 127.', 'http://127.evil.example:5273'],
    ['a subdomain of a loopback-looking name', 'http://127.0.0.1.evil.example'],
    ['a public address', 'http://203.0.113.4'],
    ['a sandboxed iframe', 'null'],
    ['an unparseable origin', 'not a url'],
  ])('refuses %s', (_label, origin) => {
    expect(fromLoopback(origin)).toBe(false);
  });
});

describe('writeIfChanged', () => {
  it('does not rewrite a file whose bytes are unchanged', () => {
    const target = join(dir, 'card.md');
    writeFileSync(target, 'same');
    const before = statSync(target).mtimeMs;

    expect(writeIfChanged(target, 'same')).toBe(false);
    expect(statSync(target).mtimeMs).toBe(before);
  });

  it('writes when the bytes differ, and reports it', () => {
    const target = join(dir, 'card.md');
    writeFileSync(target, 'old');

    expect(writeIfChanged(target, 'new')).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('new');
  });

  it('creates missing directories on the way', () => {
    const target = join(dir, 'cards', 'deep.md');
    expect(writeIfChanged(target, 'x')).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('x');
  });

  it('leaves no temp file behind', () => {
    const target = join(dir, 'card.md');
    writeIfChanged(target, 'x');
    expect(readCardFiles(dir).map((f) => f.path)).toEqual(['card.md']);
  });
});

describe('frontmatterId', () => {
  it('reads the id, which is a card\u2019s identity and not its filename', () => {
    expect(frontmatterId(cardFile('intro'))).toBe('intro');
  });

  it.each([
    ['single quotes', "---\nid: 'intro'\n---\n"],
    ['double quotes', '---\nid: "intro"\n---\n'],
    ['CRLF line endings', '---\r\nid: intro\r\n---\r\n'],
    ['a later position in the block', '---\ntitle: T\nid: intro\n---\n'],
  ])('handles %s', (_label, text) => {
    expect(frontmatterId(text)).toBe('intro');
  });

  it.each([
    ['no frontmatter', '# Just a heading\n'],
    ['frontmatter without an id', '---\ntitle: T\n---\n'],
    ['an unterminated frontmatter block', '---\nid: x\n'],
  ])('returns undefined for %s', (_label, text) => {
    expect(frontmatterId(text)).toBeUndefined();
  });

  it('ignores an id in the body', () => {
    // The id decides which file a card is written back to, so a body line
    // winning here silently redirects a write. Scanning from the opening fence
    // for the first `id:` never stopped at the closing one.
    expect(frontmatterId('---\ntitle: T\n---\n\nid: injected\n')).toBeUndefined();
  });

  it('prefers the frontmatter id over one in the body', () => {
    expect(frontmatterId('---\nid: real\n---\n\nid: injected\n')).toBe('real');
  });
});

describe('readCardFiles', () => {
  it('scans two locations and never below them', () => {
    writeFileSync(join(dir, 'beside.md'), cardFile('beside'));
    mkdirSync(join(dir, 'cards'));
    writeFileSync(join(dir, 'cards', 'under.md'), cardFile('under'));
    mkdirSync(join(dir, 'cards', 'deeper'));
    writeFileSync(join(dir, 'cards', 'deeper', 'nested.md'), cardFile('nested'));

    // Non-recursive on purpose: ADR 0001's nested spaces want subdirectories,
    // and a recursive scan would make each one ambiguous with card discovery.
    expect(readCardFiles(dir).map((f) => f.path)).toEqual(['beside.md', 'cards/under.md']);
  });

  it('ignores files that are not markdown', () => {
    writeFileSync(join(dir, 'space.json'), '{}');
    writeFileSync(join(dir, 'notes.txt'), 'x');
    writeFileSync(join(dir, 'card.md'), cardFile('card'));

    expect(readCardFiles(dir).map((f) => f.path)).toEqual(['card.md']);
  });

  it('returns nothing for a directory that does not exist yet', () => {
    expect(readCardFiles(join(dir, 'nowhere'))).toEqual([]);
  });
});

describe('cardPathById', () => {
  it('keys a card by its frontmatter id, not its filename', () => {
    writeFileSync(join(dir, 'whatever.md'), cardFile('intro'));
    expect(cardPathById(dir).get('intro')).toBe('whatever.md');
  });
});

describe('writeSpace', () => {
  it('keeps a card where its author put it', () => {
    writeFileSync(join(dir, 'intro.md'), cardFile('intro'));

    writeSpace(dir, spaceFile, [{ id: 'intro', text: cardFile('intro', 'Edited.') }]);

    // Rewritten beside the space file, where it already sat — not duplicated
    // into `cards/`.
    expect(readFileSync(join(dir, 'intro.md'), 'utf8')).toContain('Edited.');
    expect(readCardFiles(dir).map((f) => f.path)).toEqual(['intro.md']);
  });

  it('places a card it has never seen in cards/', () => {
    writeSpace(dir, spaceFile, [{ id: 'fresh', text: cardFile('fresh') }]);
    expect(readCardFiles(dir).map((f) => f.path)).toEqual(['cards/fresh.md']);
  });

  it('never deletes a card missing from the payload', () => {
    writeFileSync(join(dir, 'keep.md'), cardFile('keep'));

    // Deletion by absence turns any client bug into data loss.
    writeSpace(dir, spaceFile, []);

    expect(readFileSync(join(dir, 'keep.md'), 'utf8')).toContain('id: keep');
  });

  it('reports only the files whose bytes changed', () => {
    const text = cardFile('intro');
    writeFileSync(join(dir, 'intro.md'), text);

    // First save writes the space file only: the card is byte-identical.
    expect(writeSpace(dir, spaceFile, [{ id: 'intro', text }])).toBe(1);
    // Second save writes nothing at all.
    expect(writeSpace(dir, spaceFile, [{ id: 'intro', text }])).toBe(0);
  });

  it('does not rewrite card bodies when only the arrangement changed', () => {
    const text = cardFile('intro');
    writeFileSync(join(dir, 'intro.md'), text);
    writeSpace(dir, spaceFile, [{ id: 'intro', text }]);
    const before = statSync(join(dir, 'intro.md')).mtimeMs;

    // This is what a drag does: the space file gains a Layout, no body moves.
    const moved = {
      ...spaceFile,
      layouts: [
        { id: 'l', title: 'L', kind: 'positioned' as const, positions: { intro: { x: 1, y: 2 } } },
      ],
    };
    expect(writeSpace(dir, moved, [{ id: 'intro', text }])).toBe(1);
    expect(statSync(join(dir, 'intro.md')).mtimeMs).toBe(before);
  });

  it('writes the space file as formatted JSON with a trailing newline', () => {
    writeSpace(dir, spaceFile, []);
    const written = readFileSync(join(dir, 'space.json'), 'utf8');

    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written)).toEqual(spaceFile);
  });
});
