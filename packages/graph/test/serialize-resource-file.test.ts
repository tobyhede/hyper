import { describe, expect, it } from 'vitest';
import type { Resource } from '@project/core';
import { parseResourceFile, serializeResourceFile } from '../src/index';
import { uuid } from './resource-files';

describe('serializeResourceFile', () => {
  it('writes frontmatter, a fence, then the body', () => {
    const resource: Resource = {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: 'Resource **A**.\n',
    };

    expect(serializeResourceFile(resource)).toBe(
      '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\n---\n\nResource **A**.\n',
    );
  });

  it('quotes a title YAML would otherwise misread', () => {
    // `Recap: the data model` unquoted is a nested mapping, not a string — the
    // one authoring mistake the example space actually hit.
    const resource: Resource = {
      id: uuid('00000000-0000-4000-8000-000000000034'),
      title: 'Recap: the data model',
      kind: 'markdown',
      body: '',
    };
    const parsed = parseResourceFile({
      path: 'resources/r.md',
      text: serializeResourceFile(resource),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.resource.title).toBe('Recap: the data model');
  });

  it('writes a reference resource with its target, and no body', () => {
    const resource: Resource = {
      id: uuid('00000000-0000-4000-8000-00000000000c'),
      title: 'A′',
      kind: 'reference',
      target: uuid('00000000-0000-4000-8000-000000000002'),
    };

    expect(serializeResourceFile(resource)).toBe(
      '---\nid: 00000000-0000-4000-8000-00000000000c\ntitle: A′\nkind: reference\ntarget: 00000000-0000-4000-8000-000000000002\n---\n\n',
    );
  });

  it('writes a Space Resource with both of its selections, and no body', () => {
    const resource: Resource = {
      id: uuid('00000000-0000-4000-8000-00000000000d'),
      title: 'Nested space',
      kind: 'space',
      spaceId: uuid('00000000-0000-4000-8000-000000000010'),
      map: uuid('00000000-0000-4000-8000-000000000011'),
      graph: uuid('00000000-0000-4000-8000-000000000012'),
    };

    const parsed = parseResourceFile({
      path: 'resources/nested.md',
      text: serializeResourceFile(resource),
    });

    expect(parsed).toEqual({ ok: true, resource });
    expect(serializeResourceFile(resource)).toMatch(
      /graph: 00000000-0000-4000-8000-000000000012\n---\n\n$/,
    );
  });

  it('writes only shared and kind-owned fields', () => {
    const resource: Resource = {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: '',
    };
    expect(serializeResourceFile(resource)).not.toContain('description');
  });
});
