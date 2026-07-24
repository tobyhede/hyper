import { describe, expect, it } from 'vitest';
import type { Card } from '@project/core';
import { parseCardFile, serializeCardFile } from '../src/index';

describe('serializeCardFile', () => {
  it('writes frontmatter, a fence, then the body', () => {
    const card: Card = { id: 'a', title: 'A', kind: 'markdown', body: 'Card **A**.\n' };

    expect(serializeCardFile(card)).toBe(
      '---\nid: a\ntitle: A\nkind: markdown\n---\n\nCard **A**.\n',
    );
  });

  it('quotes a title YAML would otherwise misread', () => {
    // `Recap: the data model` unquoted is a nested mapping, not a string — the
    // one authoring mistake the example space actually hit.
    const card: Card = { id: 'r', title: 'Recap: the data model', kind: 'markdown', body: '' };
    const parsed = parseCardFile({ path: 'cards/r.md', text: serializeCardFile(card) });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frontmatter.title).toBe('Recap: the data model');
  });

  it('writes an alias with its target, and no body', () => {
    const card: Card = { id: 'aa', title: 'A′', kind: 'alias', target: 'a', body: '' };

    expect(serializeCardFile(card)).toBe('---\nid: aa\ntitle: A′\nkind: alias\ntarget: a\n---\n\n');
  });

  it('omits a description the card does not have', () => {
    const card: Card = { id: 'a', title: 'A', kind: 'markdown', body: '' };
    expect(serializeCardFile(card)).not.toContain('description');
  });
});
