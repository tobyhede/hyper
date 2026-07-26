import { describe, expect, it } from 'vitest';
import { parseCardFile } from '../src/index';

describe('parseCardFile: CRLF', () => {
  it('leaves no carriage return on the last frontmatter field', () => {
    // The closing-fence match consumes the `\n` of the final CRLF pair, so
    // slicing one past its `\r` handed YAML a dangling carriage return and YAML
    // — correctly — read it as part of the value. Every card in a CRLF checkout
    // parsed with a trailing `\r` on whichever field came last, which for the
    // usual card is its title.
    const parsed = parseCardFile({
      path: 'a.md',
      text: '---\r\nid: a\r\ntitle: A\r\n---\r\n\r\nBody\r\n',
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.frontmatter.id).toBe('a');
      expect(parsed.frontmatter.title).toBe('A');
    }
  });
});

describe('parseCardFile', () => {
  it('reads a card from its frontmatter and keeps the body', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: a\ntitle: A\ndescription: Where every route begins\n---\n\nCard **A** is the entry point.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({
      id: 'a',
      title: 'A',
      description: 'Where every route begins',
      kind: 'markdown',
    });
    expect(result.body).toBe('Card **A** is the entry point.\n');
  });

  it('reads an alias, whose body is empty (ADR 0009)', () => {
    const result = parseCardFile({
      path: 'cards/a-prime.md',
      text: '---\nid: a-prime\ntitle: A′\nkind: alias\ntarget: a\n---\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({ id: 'a-prime', title: 'A′', kind: 'alias', target: 'a' });
    expect(result.body).toBe('');
  });

  it('reads a card whose file ends at the closing fence, with no trailing newline', () => {
    const result = parseCardFile({ path: 'cards/a.md', text: '---\nid: a\ntitle: A\n---' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toBe('');
  });

  it('keeps a body that opens with a heading, which is now just a heading (ADR 0020)', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: a\ntitle: A\n---\n\n# A\n\nProse under the heading.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toBe('# A\n\nProse under the heading.\n');
  });

  it('keeps a horizontal rule in the body, because only the first fence closes', () => {
    const result = parseCardFile({
      path: 'cards/a.md',
      text: '---\nid: a\ntitle: A\n---\n\nAbove.\n\n---\n\nBelow.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter.id).toBe('a');
    expect(result.body).toBe('Above.\n\n---\n\nBelow.\n');
  });

  it('reports an unquoted numeric id, which YAML reads as a number', () => {
    // Frontmatter is YAML, so `id: 2024` is the number 2024 and not the string.
    // Quoting fixes it; what matters is that the failure names the file and the
    // field rather than loading a card whose id is not a string.
    const result = parseCardFile({ path: 'cards/2024.md', text: '---\nid: 2024\ntitle: A\n---\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain('id');

    const quoted = parseCardFile({
      path: 'cards/2024.md',
      text: "---\nid: '2024'\ntitle: A\n---\n",
    });
    expect(quoted.ok && quoted.frontmatter.id).toBe('2024');
  });

  it('reports a file with no frontmatter rather than treating it as a body', () => {
    const result = parseCardFile({ path: 'cards/a.md', text: 'Just a body.\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['missing-frontmatter']);
    expect(result.errors[0]?.message).toContain('cards/a.md');
  });

  it('reports frontmatter that never closes', () => {
    const result = parseCardFile({ path: 'cards/a.md', text: '---\nid: a\ntitle: A\n' });

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
    const result = parseCardFile({ path: 'cards/a.md', text: '---\nid: a\n---\n\nBody\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain('title');
  });

  it('accepts CRLF fences, as a Windows checkout produces', () => {
    // `core.autocrlf` makes every card in the repository start `---\r\n`, and a
    // LF-only fence check called all of them frontmatter-less — so the space
    // failed to load at all rather than failing to look right.
    const lf = '---\nid: intro\ntitle: T\n---\n\nBody line.\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    const result = parseCardFile({ path: 'a.md', text: crlf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter.id).toBe('intro');
    expect(result.body.trim()).toBe('Body line.');
  });
});
