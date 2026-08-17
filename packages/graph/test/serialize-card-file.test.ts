import { describe, expect, it } from 'vitest';
import type { Card } from '@project/core';
import { parseCardFile, serializeCardFile } from '../src/index';
import { uuid } from './card-files';

describe('serializeCardFile', () => {
  it('writes frontmatter, a fence, then the body', () => {
    const card: Card = {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: 'Card **A**.\n',
    };

    expect(serializeCardFile(card)).toBe(
      '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\n---\n\nCard **A**.\n',
    );
  });

  it('quotes a title YAML would otherwise misread', () => {
    // `Recap: the data model` unquoted is a nested mapping, not a string — the
    // one authoring mistake the example space actually hit.
    const card: Card = {
      id: uuid('00000000-0000-4000-8000-000000000034'),
      title: 'Recap: the data model',
      kind: 'markdown',
      body: '',
    };
    const parsed = parseCardFile({ path: 'cards/r.md', text: serializeCardFile(card) });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.card.title).toBe('Recap: the data model');
  });

  it('writes an alias with its target, and no body', () => {
    const card: Card = {
      id: uuid('00000000-0000-4000-8000-00000000000c'),
      title: 'A′',
      kind: 'alias',
      target: uuid('00000000-0000-4000-8000-000000000002'),
    };

    expect(serializeCardFile(card)).toBe(
      '---\nid: 00000000-0000-4000-8000-00000000000c\ntitle: A′\nkind: alias\ntarget: 00000000-0000-4000-8000-000000000002\n---\n\n',
    );
  });

  it('writes only shared and kind-owned fields', () => {
    const card: Card = {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: '',
    };
    expect(serializeCardFile(card)).not.toContain('description');
  });
});
