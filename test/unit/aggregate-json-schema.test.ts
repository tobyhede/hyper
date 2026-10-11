import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020';
import { aggregateFileSchema, importSpaceFileSchema } from '@project/core';
import { describe, expect, it } from 'vitest';
import hyperFileSchema from '../../docs/schema/hyper.schema.json';
import idSchema from '../../docs/schema/id.schema.json';
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
    const examples: unknown[] = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => {
      const parsed: unknown = JSON.parse(match[1] ?? '');
      return parsed;
    });
    const [hyperExample, spaceExample] = examples;
    expect(hyperSchema(hyperExample)).toBe(true);
    expect(spaceSchema(spaceExample)).toBe(true);
    expect(aggregateFileSchema.safeParse(hyperExample).success).toBe(true);
    expect(importSpaceFileSchema.safeParse(spaceExample).success).toBe(true);
  });
});

/**
 * The Resource file schema is specified ahead of intake (ADR 0128), so nothing
 * yet holds it to an intake; this holds it to compiling under strict mode and
 * to accepting the example its README publishes for each kind.
 */
describe('the Resource file JSON Schema', () => {
  const examples = join(repoRoot, 'docs/schema/resource/examples');

  it.each(['markdown', 'reference', 'space', 'image', 'ur'])(
    'accepts the published %s example',
    (kind) => {
      const resourceFileSchema = validator('resource/resource.schema.json');
      const example: unknown = JSON.parse(readFileSync(join(examples, `${kind}.json`), 'utf8'));
      expect(resourceFileSchema(example), JSON.stringify(resourceFileSchema.errors)).toBe(true);
    },
  );
});
