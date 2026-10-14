import type { z } from 'zod';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  KIND_IDS,
  contentTarget,
  isKindId,
  isRegisteredKind,
  newResourceDocument,
  resolveContent,
  startsEmpty,
  UNRESOLVED_CONTENT,
  resourceReferences,
  type EmptyCreatableKindId,
  type ResourceDocument,
} from '../src/kinds/registry';
import { uuidSchema } from '../src/schema';
import { imageKind } from '../src/kinds/image';
import { markdownKind, type markdownResourceContentSchema } from '../src/kinds/markdown';
import type { KindResolvedContent } from '../src/kinds/kind-module';
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
  ...KIND_IDS.filter(startsEmpty).map((kind) => newResourceDocument(kind, 'New')),
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

describe('where resolved content came from', () => {
  const OWN = REPRESENTATIVE.filter((doc) => contentTarget(doc) === undefined);
  const NOTES = { kind: markdownKind.id, content: { source: 'Notes' } } as const;
  const RECAP = { kind: referenceKind.id, content: { target: TARGET } } as const;

  it.each(OWN)('is the Resource itself when its kind names no Target: $kind $title', (doc) => {
    expect(resolveContent(doc, () => undefined).via).toBe('self');
  });

  it('is the Target when its kind names one', () => {
    expect(resolveContent(RECAP, () => NOTES)).toEqual({
      kind: markdownKind.id,
      source: 'Notes',
      via: 'target',
    });
  });

  it('is the Target when the Target cannot be reached, and names no kind', () => {
    expect(resolveContent(RECAP, () => undefined)).toEqual(UNRESOLVED_CONTENT);
    expect(resolveContent(RECAP, () => RECAP)).toEqual(UNRESOLVED_CONTENT);
    expect(UNRESOLVED_CONTENT).toEqual({ kind: 'unresolved', via: 'target' });
  });

  it('is not said by any kind module', () => {
    expectTypeOf<KindResolvedContent>().not.toHaveProperty('via');
    expectTypeOf<Parameters<typeof markdownKind.resolveContent>>().toEqualTypeOf<
      [z.infer<typeof markdownResourceContentSchema>]
    >();
    expect(markdownKind.resolveContent(NOTES.content)).toEqual({
      kind: markdownKind.id,
      source: 'Notes',
    });
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

/**
 * The kinds a press may create empty, written out once, so the type the
 * modules' declarations derive and the runtime answer are held to the same list.
 */
const STARTS_EMPTY = ['markdown', 'ur'] as const;

describe('the kinds a Resource may be created empty as', () => {
  it('are typed as exactly the kinds whose module declares new content', () => {
    expectTypeOf<EmptyCreatableKindId>().toEqualTypeOf<(typeof STARTS_EMPTY)[number]>();
  });

  it('are answered at runtime as the same kinds', () => {
    expect(KIND_IDS.filter(startsEmpty)).toEqual(STARTS_EMPTY);
  });
});
