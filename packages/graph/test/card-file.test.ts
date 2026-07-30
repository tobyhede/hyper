import { describe, expect, it } from 'vitest';
import { parseCardFile, parseImportCardFile } from '../src/index';

const CARD_A = '00000000-0000-4000-8000-000000000002';

describe('parseCardFile: CRLF', () => {
  it('leaves no carriage return on the last frontmatter field', () => {
    // The closing-fence match consumes the `\n` of the final CRLF pair, so
    // slicing one past its `\r` handed YAML a dangling carriage return and YAML
    // — correctly — read it as part of the value. Every card in a CRLF checkout
    // parsed with a trailing `\r` on whichever field came last, which for the
    // usual card is its title.
    const parsed = parseCardFile({
      path: 'a.md',
      text: '---\r\nid: 00000000-0000-4000-8000-000000000002\r\ntitle: A\r\n---\r\n\r\nBody\r\n',
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.card.id).toBe('00000000-0000-4000-8000-000000000002');
      expect(parsed.card.title).toBe('A');
    }
  });
});

describe('parseCardFile', () => {
  it('parses an id-less Markdown file only through the import intake', () => {
    const file = {
      path: 'cards/new.md',
      text: '---\ntitle: New card\nkind: markdown\n---\n\nNew body\n',
    };

    expect(parseCardFile(file).ok).toBe(false);
    expect(parseImportCardFile(file)).toEqual({
      ok: true,
      card: {
        document: { title: 'New card', kind: 'markdown', body: 'New body\n' },
      },
    });
  });

  it('keeps an id-less alias target UUID-only and bodyless', () => {
    expect(
      parseImportCardFile({
        path: 'cards/alias.md',
        text: `---\ntitle: Alias\nkind: alias\ntarget: ${CARD_A}\n---\n`,
      }),
    ).toEqual({
      ok: true,
      card: { document: { title: 'Alias', kind: 'alias', target: CARD_A } },
    });
    expect(
      parseImportCardFile({
        path: 'cards/alias.md',
        text: '---\ntitle: Alias\nkind: alias\ntarget: card-a\n---\nBody',
      }).ok,
    ).toBe(false);
  });

  it('reads a card from its frontmatter and keeps the body', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\ndescription: Where every route begins\n---\n\nCard **A** is the entry point.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      description: 'Where every route begins',
      kind: 'markdown',
      body: 'Card **A** is the entry point.\n',
    });
  });

  it('reads an alias, which has no body (ADR 0009)', () => {
    const result = parseCardFile({
      path: 'cards/a-prime.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000007\ntitle: A′\nkind: alias\ntarget: 00000000-0000-4000-8000-000000000002\n---\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card).toEqual({
      id: '00000000-0000-4000-8000-000000000007',
      title: 'A′',
      kind: 'alias',
      target: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('reads a card whose file ends at the closing fence, with no trailing newline', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\n---',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      kind: 'markdown',
      body: '',
    });
  });

  it('keeps a body that opens with a heading, which is now just a heading (ADR 0020)', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\n---\n\n# A\n\nProse under the heading.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.kind === 'markdown' && result.card.body).toBe(
      '# A\n\nProse under the heading.\n',
    );
  });

  it('keeps a horizontal rule in the body, because only the first fence closes', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\n---\n\nAbove.\n\n---\n\nBelow.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.id).toBe('00000000-0000-4000-8000-000000000002');
    expect(result.card.kind === 'markdown' && result.card.body).toBe('Above.\n\n---\n\nBelow.\n');
  });

  it('reports an unquoted numeric id, which YAML reads as a number', () => {
    // Frontmatter is YAML, so `id: 2024` is the number 2024 and not the string.
    // Quoting changes the YAML type but does not turn a number into UUID identity.
    const result = parseCardFile({ path: 'cards/2024.md', text: '---\nid: 2024\ntitle: A\n---\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain('id');

    const quoted = parseCardFile({
      path: 'cards/2024.md',
      text: "---\nid: '2024'\ntitle: A\n---\n",
    });
    expect(quoted.ok).toBe(false);
  });

  it('reports a file with no frontmatter rather than treating it as a body', () => {
    const result = parseCardFile({ path: 'cards/a.md', text: 'Just a body.\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['missing-frontmatter']);
    expect(result.errors[0]?.message).toContain('cards/a.md');
  });

  it('reports frontmatter that never closes', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['unterminated-frontmatter']);
  });

  it('reports unparseable YAML as an error rather than throwing', () => {
    const result = parseCardFile({ path: 'cards/a.md', text: '---\nid: [a\n---\n\nBody\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-yaml']);
  });

  it('reports frontmatter that parses but is not a card', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\n---\n\nBody\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain('title');
  });

  it('accepts CRLF fences, as a Windows checkout produces', () => {
    // `core.autocrlf` makes every card in the repository start `---\r\n`, and a
    // LF-only fence check called all of them frontmatter-less — so the space
    // failed to load at all rather than failing to look right.
    const lf = '---\nid: 00000000-0000-4000-8000-000000000027\ntitle: T\n---\n\nBody line.\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    const result = parseCardFile({ path: 'a.md', text: crlf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.id).toBe('00000000-0000-4000-8000-000000000027');
    expect(result.card.kind === 'markdown' && result.card.body.trim()).toBe('Body line.');
  });
});
