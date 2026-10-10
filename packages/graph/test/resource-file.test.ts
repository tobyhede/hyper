import { describe, expect, it } from 'vitest';
import { parseResourceFile, parseImportResourceFile } from '../src/index';

const RESOURCE_A = '00000000-0000-4000-8000-000000000002';

describe('parseResourceFile: CRLF', () => {
  it('leaves no carriage return on the last frontmatter field', () => {
    // The closing-fence match consumes the `\n` of the final CRLF pair, so
    // slicing one past its `\r` handed YAML a dangling carriage return and YAML
    // — correctly — read it as part of the value. Every resource in a CRLF checkout
    // parsed with a trailing `\r` on whichever field came last, which for the
    // usual resource is its title.
    const parsed = parseResourceFile({
      path: 'a.md',
      text: '---\r\nid: 00000000-0000-4000-8000-000000000002\r\nkind: markdown\r\ntitle: A\r\n---\r\n\r\nBody\r\n',
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.resource.id).toBe('00000000-0000-4000-8000-000000000002');
      expect(parsed.resource.title).toBe('A');
    }
  });
});

describe('parseResourceFile', () => {
  it('parses an id-less Markdown file only through the import intake', () => {
    const file = {
      path: 'resources/new.md',
      text: '---\ntitle: New resource\nkind: markdown\n---\n\nNew body\n',
    };

    expect(parseResourceFile(file).ok).toBe(false);
    expect(parseImportResourceFile(file)).toEqual({
      ok: true,
      resource: {
        document: { title: 'New resource', kind: 'markdown', body: 'New body\n' },
      },
    });
  });

  it('keeps an id-less reference target UUID-only and bodyless', () => {
    expect(
      parseImportResourceFile({
        path: 'resources/reference.md',
        text: `---\ntitle: Reference Resource\nkind: reference\ntarget: ${RESOURCE_A}\n---\n`,
      }),
    ).toEqual({
      ok: true,
      resource: {
        document: { title: 'Reference Resource', kind: 'reference', target: RESOURCE_A },
      },
    });
    expect(
      parseImportResourceFile({
        path: 'resources/reference.md',
        text: '---\ntitle: Reference Resource\nkind: reference\ntarget: resource-a\n---\nBody',
      }).ok,
    ).toBe(false);
  });

  it('refuses a shared Description, naming the key, rather than dropping it', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\ndescription: Where every graph begins\n---\n\nResource **A** is the entry point.\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map(({ kind }) => kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain("'description'");
  });

  it('reads a reference resource, which has no body (ADR 0009)', () => {
    const result = parseResourceFile({
      path: 'resources/a-prime.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000007\ntitle: A′\nkind: reference\ntarget: 00000000-0000-4000-8000-000000000002\n---\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resource).toEqual({
      id: '00000000-0000-4000-8000-000000000007',
      title: 'A′',
      kind: 'reference',
      target: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('reads an Ur Resource, which has no body (ADR 0113)', () => {
    const text = `---\nid: ${RESOURCE_A}\ntitle: Node\nkind: ur\n---\n`;
    expect(parseResourceFile({ path: 'resources/node.md', text })).toEqual({
      ok: true,
      resource: { id: RESOURCE_A, title: 'Node', kind: 'ur' },
    });
    expect(
      parseImportResourceFile({
        path: 'resources/node.md',
        text: '---\ntitle: Node\nkind: ur\n---\n',
      }),
    ).toEqual({ ok: true, resource: { document: { title: 'Node', kind: 'ur' } } });
  });

  it('refuses an Ur Resource carrying a body rather than discarding it', () => {
    const result = parseResourceFile({
      path: 'resources/node.md',
      text: `---\nid: ${RESOURCE_A}\ntitle: Node\nkind: ur\n---\n\nProse.\n`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map(({ kind }) => kind)).toEqual(['invalid-frontmatter']);
  });

  it('reads a resource whose file ends at the closing fence, with no trailing newline', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\n---',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resource).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      kind: 'markdown',
      body: '',
    });
  });

  it('keeps a body that opens with a heading, which is now just a heading (ADR 0020)', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\n---\n\n# A\n\nProse under the heading.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resource.kind === 'markdown' && result.resource.body).toBe(
      '# A\n\nProse under the heading.\n',
    );
  });

  it('keeps a horizontal rule in the body, because only the first fence closes', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\nkind: markdown\n---\n\nAbove.\n\n---\n\nBelow.\n',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resource.id).toBe('00000000-0000-4000-8000-000000000002');
    expect(result.resource.kind === 'markdown' && result.resource.body).toBe(
      'Above.\n\n---\n\nBelow.\n',
    );
  });

  it('reports an unquoted numeric id, which YAML reads as a number', () => {
    // Frontmatter is YAML, so `id: 2024` is the number 2024 and not the string.
    // Quoting changes the YAML type but does not turn a number into UUID identity.
    const result = parseResourceFile({
      path: 'resources/2024.md',
      text: '---\nid: 2024\ntitle: A\nkind: markdown\n---\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain('id');

    const quoted = parseResourceFile({
      path: 'resources/2024.md',
      text: "---\nid: '2024'\ntitle: A\n---\n",
    });
    expect(quoted.ok).toBe(false);
  });

  it('reports a file with no frontmatter rather than treating it as a body', () => {
    const result = parseResourceFile({ path: 'resources/a.md', text: 'Just a body.\n' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['missing-frontmatter']);
    expect(result.errors[0]?.message).toContain('resources/a.md');
  });

  it('reports frontmatter that never closes', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['unterminated-frontmatter']);
  });

  it('reports unparseable YAML as an error rather than throwing', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: [a\n---\n\nBody\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-yaml']);
  });

  it('reports frontmatter that parses but is not a resource', () => {
    const result = parseResourceFile({
      path: 'resources/a.md',
      text: '---\nid: 00000000-0000-4000-8000-000000000002\n---\n\nBody\n',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['invalid-frontmatter']);
    expect(result.errors[0]?.message).toContain('title');
  });

  it('accepts CRLF fences, as a Windows checkout produces', () => {
    // `core.autocrlf` makes every resource in the repository start `---\r\n`, and a
    // LF-only fence check called all of them frontmatter-less — so the space
    // failed to load at all rather than failing to look right.
    const lf =
      '---\nid: 00000000-0000-4000-8000-000000000027\ntitle: T\nkind: markdown\n---\n\nBody line.\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    const result = parseResourceFile({ path: 'a.md', text: crlf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resource.id).toBe('00000000-0000-4000-8000-000000000027');
    expect(result.resource.kind === 'markdown' && result.resource.body.trim()).toBe('Body line.');
  });
});

describe('resource file intake refuses a frontmatter key no kind declares', () => {
  it('refuses a misspelt Space Resource key, naming the key and the file', () => {
    const text = [
      '---',
      `id: ${RESOURCE_A}`,
      'title: Inner',
      'kind: space',
      `spaceId: ${RESOURCE_A}`,
      `map: ${RESOURCE_A}`,
      `graph: ${RESOURCE_A}`,
      'framng:',
      '  centreX: 0',
      '  centreY: 0',
      '  zoom: 1',
      '---',
      '',
    ].join('\n');

    for (const result of [
      parseResourceFile({ path: 'resources/inner.md', text }),
      parseImportResourceFile({ path: 'resources/inner.md', text }),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.map(({ kind }) => kind)).toEqual(['invalid-frontmatter']);
      expect(result.errors[0]?.message).toContain('resources/inner.md');
      expect(result.errors[0]?.message).toContain("'framng'");
    }
  });

  it('refuses a misspelt Markdown Resource key rather than dropping it', () => {
    const text = `---\nid: ${RESOURCE_A}\ntitle: A\nkind: markdown\ntilte: A\n---\n\nProse.\n`;

    for (const result of [
      parseResourceFile({ path: 'resources/a.md', text }),
      parseImportResourceFile({ path: 'resources/a.md', text }),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]?.message).toContain('resources/a.md');
      expect(result.errors[0]?.message).toContain("'tilte'");
    }
  });
});

describe('a resource file that declares no kind is an Ur Resource', () => {
  it('reads frontmatter with no kind and no body as an Ur Resource', () => {
    expect(
      parseResourceFile({
        path: 'resources/node.md',
        text: `---\nid: ${RESOURCE_A}\ntitle: Node\n---\n`,
      }),
    ).toEqual({ ok: true, resource: { id: RESOURCE_A, title: 'Node', kind: 'ur' } });
    expect(
      parseImportResourceFile({ path: 'resources/node.md', text: '---\ntitle: Node\n---\n' }),
    ).toEqual({ ok: true, resource: { document: { title: 'Node', kind: 'ur' } } });
  });

  it('refuses a body under frontmatter with no kind, telling the author to declare Markdown', () => {
    const text = `---\nid: ${RESOURCE_A}\ntitle: A\n---\n\nProse.\n`;

    for (const result of [
      parseResourceFile({ path: 'resources/a.md', text }),
      parseImportResourceFile({ path: 'resources/a.md', text }),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.map(({ kind }) => kind)).toEqual(['invalid-frontmatter']);
      expect(result.errors[0]?.message).toContain('resources/a.md');
      expect(result.errors[0]?.message).toContain('kind: markdown');
    }
  });
});
