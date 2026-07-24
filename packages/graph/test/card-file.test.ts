import { describe, expect, it } from 'vitest';
import { parseCardFile } from '../src/index';

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
});
