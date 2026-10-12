import { describe, expect, it } from 'vitest';
import {
  KIND_IDS,
  contentTarget,
  isKindId,
  isRegisteredKind,
  newResourceDocument,
  resourceReferences,
  type ResourceDocument,
} from '../src/kinds/registry';
import { uuidSchema } from '../src/schema';
import { imageKind } from '../src/kinds/image';
import { markdownKind } from '../src/kinds/markdown';
import { referenceKind } from '../src/kinds/reference';
import { spaceKind } from '../src/kinds/space';
import { urKind } from '../src/kinds/ur';

describe('the kind registry', () => {
  it('registers every kind module', () => {
    for (const kind of [urKind, imageKind, markdownKind, referenceKind, spaceKind]) {
      expect(isRegisteredKind(kind.id), kind.id).toBe(true);
    }
  });

  it.each(['chart', 'vnd.example.chart', 'Markdown', ''])(
    'does not register %j, which no module declares',
    (kind) => {
      expect(isRegisteredKind(kind)).toBe(false);
    },
  );
});

const TARGET = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

/** Content of every kind: what each kind starts with, and one of each that references something. */
const REPRESENTATIVE: readonly ResourceDocument[] = [
  ...KIND_IDS.flatMap((kind) => newResourceDocument(kind, 'New') ?? []),
  { title: 'Figure', kind: imageKind.id, content: { url: 'https://example.com/a.png' } },
  { title: 'Recap', kind: referenceKind.id, content: { target: TARGET } },
  { title: 'Inner', kind: spaceKind.id, content: { spaceId: SPACE, map: SPACE, graph: SPACE } },
];

describe("a kind's content Target", () => {
  it('has content of every registered kind to read', () => {
    expect(new Set(REPRESENTATIVE.map(({ kind }) => kind))).toEqual(new Set(KIND_IDS));
  });

  /** Resolution reads the Target intake has resolved as a Resource reference, and no other. */
  it.each(REPRESENTATIVE)('is one of the Resources its content references: $kind $title', (doc) => {
    const target = contentTarget(doc);
    if (target !== undefined) expect(resourceReferences(doc)).toContain(target);
  });

  it('is read for the Reference kind', () => {
    expect(REPRESENTATIVE.map((doc) => contentTarget(doc))).toContain(TARGET);
  });
});

describe('a kind id', () => {
  it.each(['markdown', 'chart', 'a', '3d', 'x-ray', 'vnd.owner.name', 'vnd.a-b.c-1'])(
    'accepts %j',
    (id) => {
      expect(isKindId(id)).toBe(true);
    },
  );

  it.each([
    '',
    'a.b',
    'vnd.a',
    'vnd.a.b.c',
    'vnd..b',
    'a/b',
    '-a',
    'vnd.-a.b',
    'vnd.a.-b',
    'a b',
    'a_b',
    'café',
  ])('refuses %j', (id) => {
    expect(isKindId(id)).toBe(false);
  });
});
