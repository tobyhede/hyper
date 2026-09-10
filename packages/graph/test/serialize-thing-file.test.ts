import { describe, expect, it } from 'vitest';
import type { Thing } from '@project/core';
import { parseThingFile, serializeThingFile } from '../src/index';
import { uuid } from './thing-files';

describe('serializeThingFile', () => {
  it('writes frontmatter, a fence, then the body', () => {
    const thing: Thing = {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: 'Thing **A**.\n',
    };

    expect(serializeThingFile(thing)).toBe(
      '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\n---\n\nThing **A**.\n',
    );
  });

  it('quotes a title YAML would otherwise misread', () => {
    // `Recap: the data model` unquoted is a nested mapping, not a string — the
    // one authoring mistake the example space actually hit.
    const thing: Thing = {
      id: uuid('00000000-0000-4000-8000-000000000034'),
      title: 'Recap: the data model',
      kind: 'markdown',
      body: '',
    };
    const parsed = parseThingFile({ path: 'things/r.md', text: serializeThingFile(thing) });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.thing.title).toBe('Recap: the data model');
  });

  it('writes an alias with its target, and no body', () => {
    const thing: Thing = {
      id: uuid('00000000-0000-4000-8000-00000000000c'),
      title: 'A′',
      kind: 'alias',
      target: uuid('00000000-0000-4000-8000-000000000002'),
    };

    expect(serializeThingFile(thing)).toBe(
      '---\nid: 00000000-0000-4000-8000-00000000000c\ntitle: A′\nkind: alias\ntarget: 00000000-0000-4000-8000-000000000002\n---\n\n',
    );
  });

  it('writes a Space Thing with both of its selections, and no body', () => {
    const thing: Thing = {
      id: uuid('00000000-0000-4000-8000-00000000000d'),
      title: 'Nested space',
      kind: 'space',
      spaceId: uuid('00000000-0000-4000-8000-000000000010'),
      diagram: uuid('00000000-0000-4000-8000-000000000011'),
      graph: uuid('00000000-0000-4000-8000-000000000012'),
    };

    const parsed = parseThingFile({ path: 'things/nested.md', text: serializeThingFile(thing) });

    expect(parsed).toEqual({ ok: true, thing });
    expect(serializeThingFile(thing)).toMatch(
      /graph: 00000000-0000-4000-8000-000000000012\n---\n\n$/,
    );
  });

  it('writes only shared and kind-owned fields', () => {
    const thing: Thing = {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: '',
    };
    expect(serializeThingFile(thing)).not.toContain('description');
  });
});
