import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020';
import {
  KIND_IDS,
  aggregateFileSchema,
  importSpaceFileSchema,
  isAcceptedImageUrl,
  uuidSchema,
} from '@project/core';
import {
  loadSpace,
  loadSpaceAggregate,
  parseResourceFiles,
  type ResourceFile,
} from '@project/graph';
import { describe, expect, it } from 'vitest';
import hyperFileSchema from '../../docs/schema/hyper.schema.json';
import idSchema from '../../docs/schema/id.schema.json';
import envelopeSchema from '../../docs/schema/resource/envelope.schema.json';
import imageSchema from '../../docs/schema/resource/kinds/image.schema.json';
import markdownSchema from '../../docs/schema/resource/kinds/markdown.schema.json';
import referenceSchema from '../../docs/schema/resource/kinds/reference.schema.json';
import spaceKindSchema from '../../docs/schema/resource/kinds/space.schema.json';
import urSchema from '../../docs/schema/resource/kinds/ur.schema.json';
import locatorSchema from '../../docs/schema/resource/locator.schema.json';
import resourceSchema from '../../docs/schema/resource/resource.schema.json';
import spaceFileSchema from '../../docs/schema/space.schema.json';

/**
 * `docs/schema/hyper.schema.json` and `space.schema.json` publish the shapes
 * `@project/core` reads `hyper.json` and `space.json` with. Their README says
 * they refuse only what intake refuses; this holds each schema to the Zod
 * intake on the same files, so a change to either side that disagrees fails.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const base = 'https://raw.githubusercontent.com/tobyhede/hyper/main/docs/schema/';

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema([
  idSchema,
  hyperFileSchema,
  spaceFileSchema,
  locatorSchema,
  envelopeSchema,
  urSchema,
  markdownSchema,
  imageSchema,
  referenceSchema,
  spaceKindSchema,
  resourceSchema,
]);

function validator(name: string) {
  const validate = ajv.getSchema(`${base}${name}`);
  if (validate === undefined) throw new Error(`${name} is not registered under ${base}`);
  return validate;
}

const hyperSchema = validator('hyper.schema.json');
const spaceSchema = validator('space.schema.json');
const resourceFileSchema = validator('resource/resource.schema.json');
const locator = validator('resource/locator.schema.json');

/** A file's content as JSON states it, before any schema reads it. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const resourceA = 'a0000000-0000-4000-8000-000000000001';
const resourceB = 'a0000000-0000-4000-8000-000000000002';

const edge = () => ({ from: resourceA, to: resourceB, title: 'then' });
const graph = (edges: Json[] = [edge()]) => ({
  id: 'b0000000-0000-4000-8000-000000000002',
  title: 'Main',
  color: '#1f77b4',
  headShape: 'arrow',
  edges,
});
const placement = () => ({ x: 0, y: 0, open: false });
const mapEntry = (
  positions: Record<string, Json> = { [resourceA]: placement() },
  graphs: Json[] = [graph()],
) => ({
  id: 'b0000000-0000-4000-8000-000000000001',
  title: 'Talk',
  kind: 'positioned',
  positions,
  graphs,
  activeGraph: 'b0000000-0000-4000-8000-000000000002',
});
const space = (maps: Json[] = [mapEntry()]) => ({
  version: 1,
  id: '2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c',
  title: 'Rust async',
  maps,
  defaultMap: 'b0000000-0000-4000-8000-000000000001',
});
const withPlacement = (extra: Record<string, Json>) =>
  space([mapEntry({ [resourceA]: { ...placement(), ...extra } })]);
const withEdge = (next: Json) => space([mapEntry(undefined, [graph([next])])]);
const { title: _title, ...untitledEdge } = edge();
const hyper = { version: 1, metaSpaceId: '2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c' };

const spaceCases: [string, Json][] = [
  ['a whole file', space()],
  [
    'no Space, Map or Graph ids and no Map kind',
    {
      version: 1,
      title: 'T',
      maps: [{ title: 'M', positions: {}, graphs: [{ title: 'G', edges: [] }] }],
    },
  ],
  ['no Maps', { version: 1, title: 'T' }],
  ['version 2', { ...space(), version: 2 }],
  ['an unknown top-level key', { ...space(), resources: [] }],
  ['an empty title', { ...space(), title: '' }],
  ['a Map kind other than positioned', space([{ ...mapEntry(), kind: 'grid' }])],
  ['a Map with no Graphs', space([mapEntry(undefined, [])])],
  ['a position keyed by a non-Id', space([mapEntry({ nope: placement() })])],
  ['a misspelt placement key', withPlacement({ opne: true })],
  ['a Shape', withPlacement({ shape: 'pill' })],
  ['an unknown Shape', withPlacement({ shape: 'star' })],
  ['a size', withPlacement({ size: { width: 480, height: 320 } })],
  ['a size below the minimum', withPlacement({ size: { width: 100, height: 146 } })],
  ['an unknown size key', withPlacement({ size: { width: 300, height: 200, depth: 1 } })],
  ['an unknown head shape', space([mapEntry(undefined, [{ ...graph(), headShape: 'none' }])])],
  ['an empty colour', space([mapEntry(undefined, [{ ...graph(), color: '' }])])],
  ['a Graph with no edges key', space([mapEntry(undefined, [{ title: 'G' }])])],
  ['an untrimmed Edge title', withEdge({ ...edge(), title: ' then' })],
  ['a two-line Edge title', withEdge({ ...edge(), title: 'a\nb' })],
  ['an empty Edge title', withEdge({ ...edge(), title: '' })],
  ['an Edge title with inner spaces', withEdge({ ...edge(), title: 'then  later' })],
  ['a hidden Edge title', withEdge({ ...edge(), titleHidden: true })],
  ['a hidden Edge title with no title', withEdge({ ...untitledEdge, titleHidden: true })],
  ['titleHidden false', withEdge({ ...edge(), titleHidden: false })],
  ['an unknown Edge key', withEdge({ ...edge(), label: 'x' })],
  ['a defaultMap that is not an Id', { ...space(), defaultMap: 'x' }],
];

const hyperCases: [string, Json][] = [
  ['a whole file', hyper],
  ['an unknown key', { ...hyper, spaces: [] }],
  ['version 2', { ...hyper, version: 2 }],
  ['no metaSpaceId', { version: 1 }],
  ['a metaSpaceId that is not an Id', { ...hyper, metaSpaceId: 'x' }],
];

describe('the aggregate JSON Schemas agree with intake', () => {
  it.each(spaceCases)('space.json: %s', (_name, file) => {
    expect(spaceSchema(file)).toBe(importSpaceFileSchema.safeParse(file).success);
  });

  it.each(hyperCases)('hyper.json: %s', (_name, file) => {
    expect(hyperSchema(file)).toBe(aggregateFileSchema.safeParse(file).success);
  });

  it("accepts docs/aggregate-directory.md's hyper.json and space.json examples", () => {
    const text = readFileSync(join(repoRoot, 'docs/aggregate-directory.md'), 'utf8');
    const fences = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
    // Each example is found by the key only its file has, not by its place on the page.
    const named = (key: string) =>
      fences
        .filter((fence) => fence.includes(`"${key}"`))
        .map((fence) => {
          const parsed: unknown = JSON.parse(fence);
          return parsed;
        });
    const [hyperExample, ...otherHyper] = named('metaSpaceId');
    const [spaceExample, ...otherSpace] = named('maps');
    expect([otherHyper, otherSpace]).toEqual([[], []]);
    expect(hyperSchema(hyperExample)).toBe(true);
    expect(spaceSchema(spaceExample)).toBe(true);
    expect(aggregateFileSchema.safeParse(hyperExample).success).toBe(true);
    expect(importSpaceFileSchema.safeParse(spaceExample).success).toBe(true);
  });
});

const id = '6f1d6a2e-3b7c-4d2a-9c1e-0a5b7d9e1f20';
const envelope = (kind: string, content: Json) => ({ id, title: 'A', kind, content });

const refused: [string, Json, { instancePath: string; keyword: string }][] = [
  [
    'a Resource with no kind',
    { id, title: 'A', content: {} },
    { instancePath: '', keyword: 'required' },
  ],
  ['a bare kind no build registers', envelope('video', {}), { instancePath: '', keyword: 'oneOf' }],
  [
    'a media type as a vendor kind',
    envelope('vnd.acme.image/png', {}),
    { instancePath: '/kind', keyword: 'pattern' },
  ],
  [
    'a vendor kind with no name',
    envelope('vnd.acme', {}),
    { instancePath: '/kind', keyword: 'pattern' },
  ],
  [
    'a vendor kind with an empty owner',
    envelope('vnd..chart', {}),
    { instancePath: '/kind', keyword: 'pattern' },
  ],
  [
    'an unknown Markdown content key',
    envelope('markdown', { path: `${id}.md`, mediaType: 'text/markdown', source: 'x' }),
    { instancePath: '/content', keyword: 'unevaluatedProperties' },
  ],
  [
    'an unknown envelope key',
    { ...envelope('ur', {}), body: 'x' },
    { instancePath: '', keyword: 'additionalProperties' },
  ],
  [
    'an unknown content key',
    envelope('image', { url: 'https://example.com/a.png', alt: 'x' }),
    { instancePath: '/content', keyword: 'unevaluatedProperties' },
  ],
  [
    'Ur content',
    envelope('ur', { source: 'x' }),
    { instancePath: '/content', keyword: 'additionalProperties' },
  ],
  [
    'Markdown content by URL',
    envelope('markdown', { url: 'https://example.com/a.md' }),
    { instancePath: '/content', keyword: 'required' },
  ],
  [
    'Image content by path',
    envelope('image', { path: `${id}.png`, mediaType: 'image/png' }),
    { instancePath: '/content', keyword: 'required' },
  ],
];

/**
 * No intake reads the Resource file format yet; issue 07 holds this schema to
 * one. Until then it is held to compiling under strict mode, to accepting the
 * example its README publishes for each kind, to refusing what ADR 0128 names
 * at the place it names (a missing or malformed `kind`, a bare kind no build
 * registers, an unknown key at either level, Ur content, and a locator form
 * the kind does not take), and to accepting what only intake refuses.
 */
describe('the Resource file JSON Schema', () => {
  const examples = join(repoRoot, 'docs/schema/resource/examples');

  it.each(KIND_IDS)('specifies the registered %s kind beside the others', (kind) => {
    expect(existsSync(join(repoRoot, `docs/schema/resource/kinds/${kind}.schema.json`))).toBe(true);
    expect(existsSync(join(examples, `${kind}.json`))).toBe(true);
  });

  it.each(KIND_IDS)('accepts the published %s example', (kind) => {
    const example: unknown = JSON.parse(readFileSync(join(examples, `${kind}.json`), 'utf8'));
    expect(resourceFileSchema(example), JSON.stringify(resourceFileSchema.errors)).toBe(true);
  });

  it.each([
    ['a vendor kind with any content', envelope('vnd.acme.chart', { series: [1, 2] })],
    ['a vendor kind in upper case', envelope('vnd.Acme.Chart', {})],
    [
      'a Markdown media type in another case',
      envelope('markdown', { path: `${id}.md`, mediaType: 'Text/Markdown' }),
    ],
  ])('accepts %s', (_name, file) => {
    expect(resourceFileSchema(file), JSON.stringify(resourceFileSchema.errors)).toBe(true);
  });

  it.each(refused)('refuses %s', (_name, file, error) => {
    expect(resourceFileSchema(file)).toBe(false);
    expect(resourceFileSchema.errors).toContainEqual(expect.objectContaining(error));
  });

  it.each(['http:', 'https://', 'https://exa mple.com/a.png'])(
    'accepts the Image URL %j, which only intake refuses',
    (url) => {
      expect(resourceFileSchema(envelope('image', { url }))).toBe(true);
      expect(isAcceptedImageUrl(url)).toBe(false);
    },
  );

  it.each(['a.md', 'dir/a.md', 'a..b/c.md', '.hidden/a.md'])('locates by the path %j', (path) => {
    expect(locator({ path, mediaType: 'text/markdown' }), JSON.stringify(locator.errors)).toBe(
      true,
    );
  });

  it.each(['/a.md', 'a//b.md', 'dir/', '../a.md', 'a/./b.md', 'a/..', 'a\\b.md', ''])(
    'refuses the path %j',
    (path) => {
      expect(locator({ path, mediaType: 'text/markdown' })).toBe(false);
    },
  );

  it("names a Markdown sidecar by the Id schema's own pattern", () => {
    expect(markdownSchema.properties.path.pattern).toBe(`${idSchema.pattern.slice(0, -1)}\\.md$`);
  });
});

/**
 * The Resource file schema is necessary, not sufficient: every file it refuses
 * intake refuses too, and intake refuses more. Intake here is the whole of it,
 * in order: the kind's file codec (`parseResourceFiles`), the Space's
 * (`loadSpace`, where a Target resolves) and the aggregate's
 * (`loadSpaceAggregate`, where a Space Resource's Space resolves).
 */
describe('the Resource file JSON Schema refuses only what intake refuses', () => {
  const examples = join(repoRoot, 'docs/schema/resource/examples');
  const space = uuidSchema.parse('c0000000-0000-4000-8000-000000000001');
  const other = 'c0000000-0000-4000-8000-000000000002';
  const markdown = (path: string) => envelope('markdown', { path, mediaType: 'text/markdown' });

  /** A Resource file at `resources/<id>.json`, with whatever sidecars the row puts beside it. */
  const filesOf = (file: Json, sidecars: readonly string[] = []): ResourceFile[] => [
    { path: `resources/${id}.json`, text: JSON.stringify(file) },
    ...sidecars.map((name) => ({ path: `resources/${name}`, text: 'Body.\n' })),
  ];

  const intakeRefuses = (files: readonly ResourceFile[]): boolean => {
    const decoded = parseResourceFiles(files);
    if (!decoded.ok) return true;
    const loaded = loadSpace({ version: 1, id: space, title: 'Space', maps: [] }, files);
    if (!loaded.ok) return true;
    const snapshot = {
      id: space,
      document: { version: 1, title: 'Space', maps: [] },
      resources: decoded.resources.map(({ resource: { id: resourceId, ...document } }) => ({
        id: resourceId,
        document,
      })),
    };
    return !loadSpaceAggregate({ metaSpaceId: space, snapshots: [snapshot] }).ok;
  };

  it.each(KIND_IDS)("decodes the published %s example through its kind's file codec", (kind) => {
    const text = readFileSync(join(examples, `${kind}.json`), 'utf8');
    const example: unknown = JSON.parse(text);
    expect(resourceFileSchema(example)).toBe(true);
    const sidecars = (kind === 'markdown' ? ['0b9e4f3a-1c2d-4e5f-8a6b-7c8d9e0f1a2b.md'] : []).map(
      (name) => ({
        path: `resources/${name}`,
        text: readFileSync(join(examples, name), 'utf8'),
      }),
    );
    const decoded = parseResourceFiles([{ path: `resources/${kind}.json`, text }, ...sidecars]);
    expect(decoded.ok, JSON.stringify(decoded)).toBe(true);
  });

  it('admits a valid Resource file through the whole of intake', () => {
    expect(intakeRefuses(filesOf(envelope('ur', {})))).toBe(false);
    expect(intakeRefuses(filesOf(markdown(`${id}.md`), [`${id}.md`]))).toBe(false);
    const target = {
      path: `resources/${other}.json`,
      text: JSON.stringify({ id: other, title: 'T', kind: 'ur', content: {} }),
    };
    expect(intakeRefuses([...filesOf(envelope('reference', { target: other })), target])).toBe(
      false,
    );
  });

  /** Row by row: whether the schema refuses the file as well as intake. */
  const invalid: [string, ResourceFile[], 'both' | 'only intake'][] = [
    ['a Resource with no kind', filesOf({ id, title: 'A', content: {} }), 'both'],
    ['a malformed kind id', filesOf(envelope('a.b', {})), 'both'],
    ['a bare kind no build registers', filesOf(envelope('video', {})), 'both'],
    [
      'a vendor kind this build does not register',
      filesOf(envelope('vnd.acme.chart', {})),
      'only intake',
    ],
    ['an unknown envelope key', filesOf({ ...envelope('ur', {}), body: 'x' }), 'both'],
    [
      'an unknown content key',
      filesOf(envelope('image', { url: 'https://example.com/a.png', alt: 'x' })),
      'both',
    ],
    ['an Image URL of "https://"', filesOf(envelope('image', { url: 'https://' })), 'only intake'],
    [
      'an Image URL with a space in its host',
      filesOf(envelope('image', { url: 'https://exa mple.com/a.png' })),
      'only intake',
    ],
    [
      "a Markdown path naming another Resource's <id>.md",
      filesOf(markdown(`${other}.md`), [`${other}.md`]),
      'only intake',
    ],
    ['a Markdown sidecar that does not exist', filesOf(markdown(`${id}.md`)), 'only intake'],
    [
      'a .md no Resource file names',
      [...filesOf(envelope('ur', {})), { path: 'resources/stray.md', text: 'Stray.\n' }],
      'only intake',
    ],
    [
      'a Reference whose Target does not resolve',
      filesOf(envelope('reference', { target: other })),
      'only intake',
    ],
    [
      'a Space Resource whose Space does not resolve',
      filesOf(envelope('space', { spaceId: other, map: other, graph: other })),
      'only intake',
    ],
  ];

  it.each(invalid)('intake refuses %s, and the schema: %s', (_name, files, refusedBy) => {
    expect(intakeRefuses(files)).toBe(true);
    const [resourceFile] = files;
    if (resourceFile === undefined) throw new Error('a row has its Resource file first');
    expect(resourceFileSchema(JSON.parse(resourceFile.text))).toBe(refusedBy === 'only intake');
  });

  it.each(refused)('intake refuses %s too, which the schema refuses', (_name, file) => {
    expect(intakeRefuses(filesOf(file))).toBe(true);
  });
});
