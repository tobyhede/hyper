import { describe, expect, it } from 'vitest';
import type { ZodRawShape } from 'zod';
import {
  imageResourceDocumentSchema,
  imageResourceSchema,
  markdownFileContentSchema,
  markdownResourceContentSchema,
  markdownResourceDocumentSchema,
  markdownResourceSchema,
  resourceFileSchema,
  resourceSchema,
} from '../src/index';

/**
 * The stored document is the whole markdown Resource less its id, and something has
 * to say so.
 *
 * `markdownResourceDocumentSchema` is written as `markdownResourceSchema.omit({ id:
 * true })`, so the equality holds by construction today — and that is exactly
 * why it is worth pinning. Nothing stops the day the document schema is
 * re-declared beside the resource schema, or one of them gains a rule the other
 * does not, and from then on the two agree on nothing but their author's
 * intention.
 *
 * Test-only on purpose. The equality is a property of two declarations, not a
 * rule either could carry, and a runtime assertion inside `core` would be
 * checking its own source at import time.
 *
 * The markdown pair is guarded because Markdown is the authorable content
 * document, and the image triple below because its URL rule is content an
 * author sets. An Open Reference Resource reuses its Target's renderer read-only.
 */
describe('a stored markdown document is the resource less its id', () => {
  const RESOURCE_ID = '00000000-0000-4000-8000-000000000002';

  it('drops the id and keeps every other field', () => {
    expect(Object.keys(markdownResourceDocumentSchema.shape).sort()).toEqual(
      Object.keys(markdownResourceSchema.shape)
        .filter((key) => key !== 'id')
        .sort(),
    );
  });

  /**
   * The complete half of the guard, and the reason the value table below does
   * not have to be exhaustive: `omit` copies the field schemas by reference, so
   * every rule the two share is one object. A rule that diverges — a laxer
   * `title`, a `refine` added to one side, a re-declared literal — needs a
   * different instance to live in, and there is no way to write one that this
   * does not see.
   *
   * A behaviour-preserving rewrite that happens to build fresh instances fails
   * this too, and that is the intended reading rather than a false alarm: the
   * document schema stops being *derived* at that point, and whoever makes it
   * standalone owes the equality a proof that is not this one.
   *
   * Field rules, precisely. An object-level mode — `.passthrough()`,
   * `.strict()`, a catchall — sits on the schema rather than in its `.shape`,
   * so a derived schema that appended one passes this and the table below
   * alike, neither of which offers an unknown key. That is a bound, not a hole:
   * authoring builds the document key by key, so no unknown key can reach
   * `markdownResourceSchema` along the path this file exists to guard. `omit`
   * carries the mode across anyway — both are `strip` — so a
   * divergence there needs the same standalone re-declaration that (2) already
   * refuses.
   */
  it('shares one instance of every rule with the resource schema', () => {
    const resourceFieldSchemas: ZodRawShape = markdownResourceSchema.shape;
    for (const [field, schema] of Object.entries(markdownResourceDocumentSchema.shape)) {
      expect(schema, `the document's "${field}" is not the resource's`).toBe(
        resourceFieldSchemas[field],
      );
    }
  });

  /**
   * What sharing those instances buys, said in values rather than references.
   *
   * The table is the edges of the Title and source rules and nothing else:
   * a Resource's Title normalizes and must keep one non-empty line, which is what
   * `min(1)` means, so a title of spaces is refused where a
   * title with one is kept and trimmed; a source is required and may be empty.
   * Every combination is asserted both ways,
   * because a divergence in either direction is a document that round-trips
   * through storage and then cannot be completed.
   */
  const titles = ['', ' ', '   ', 'A', ' A '];
  const sources = [undefined, '', 'source'];
  const kinds = [undefined, 'markdown', 'reference'];

  /** One combination from the title/source/kind product, present only when drawn. */
  interface CandidateDocument {
    title: string;
    content?: { source: string };
    kind?: string;
  }

  it('accepts a document exactly when the resource accepts it with an id', () => {
    const disagreements: string[] = [];
    let examined = 0;
    for (const title of titles) {
      for (const source of sources) {
        for (const kind of kinds) {
          const document: CandidateDocument = { title };
          if (source !== undefined) document.content = { source };
          if (kind !== undefined) document.kind = kind;
          examined += 1;
          const asDocument = markdownResourceDocumentSchema.safeParse(document);
          const asResource = markdownResourceSchema.safeParse({ ...document, id: RESOURCE_ID });
          if (asDocument.success !== asResource.success) {
            disagreements.push(
              `${JSON.stringify(document)}: document ${asDocument.success}, resource ${asResource.success}`,
            );
            continue;
          }
          if (asDocument.success && asResource.success) {
            expect(asResource.data).toEqual({ ...asDocument.data, id: RESOURCE_ID });
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
    /*
     * The size of the product, asserted after it, because a loop that visits
     * nothing agrees with itself perfectly: empty one of the three lists and
     * the line above passes while checking no value at all. Asserted as a
     * literal rather than as the product of the three lengths, because the
     * product moves with whatever it is measuring and would notice only the
     * empty case.
     */
    expect(examined).toBe(45);
  });
});

/**
 * The Image Resource's URL rule is one rule at every door (ADR 0106): the
 * stored document, the Resource and its Resource file each refuse a URL the
 * others refuse. The file's `naturalSize` is a strict copy of the shared object
 * (ADR 0127), so an unknown key inside it is refused at the file alone.
 */
describe('an Image Resource is held to one rule at every door', () => {
  const RESOURCE_ID = '00000000-0000-4000-8000-000000000002';

  it('shares one instance of every rule but the id between document and resource', () => {
    const resourceFieldSchemas: ZodRawShape = imageResourceSchema.shape;
    expect(Object.keys(imageResourceDocumentSchema.shape).sort()).toEqual(
      Object.keys(imageResourceSchema.shape)
        .filter((key) => key !== 'id')
        .sort(),
    );
    for (const [field, schema] of Object.entries(imageResourceDocumentSchema.shape)) {
      expect(schema, `the document's "${field}" is not the resource's`).toBe(
        resourceFieldSchemas[field],
      );
    }
  });

  it('refuses an unknown naturalSize key in a file and not at the non-strict resource', () => {
    const resource = {
      id: RESOURCE_ID,
      title: 'A',
      kind: 'image',
      content: { url: 'https://example.com/a.png', naturalSize: { width: 1, height: 2, widht: 3 } },
    };
    expect(resourceFileSchema.safeParse(resource).success).toBe(false);
    expect(imageResourceSchema.safeParse(resource).success).toBe(true);
  });

  it.each([
    ['https://example.com/a.png', true],
    ['/images/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU', true],
    ['data:image/png;base64,AA==', false],
    ['a.png', false],
  ])('answers %j the same way at every door', (url, accepted) => {
    const document = { title: 'A', kind: 'image', content: { url } };
    expect(imageResourceDocumentSchema.safeParse(document).success).toBe(accepted);
    expect(imageResourceSchema.safeParse({ ...document, id: RESOURCE_ID }).success).toBe(accepted);
    expect(resourceFileSchema.safeParse({ ...document, id: RESOURCE_ID }).success).toBe(accepted);
  });
});

/** Each field, in order, that is not in both shapes or that `file` holds a different instance of. */
const unshared = (file: ZodRawShape, resource: ZodRawShape): readonly string[] =>
  [...new Set([...Object.keys(file), ...Object.keys(resource)])]
    .filter((key) => file[key] === undefined || file[key] !== resource[key])
    .sort();

/**
 * A Resource file is the Resource's envelope made strict (ADR 0128), and it
 * holds the Resource's own instance of every rule it shares: the id, the
 * Title, and each content field of every kind whose file holds its content.
 * Where file intake makes a nested object strict, `framing` and `naturalSize`,
 * the copy is a new object whose fields must still be the shared ones. A
 * Markdown Resource's file holds a locator in place of its source, so its
 * content is the one that is not shared.
 *
 * `.strict()` and `.extend()` copy field schemas by reference, which is what
 * lets a stricter file schema share instances at all, and what a rule
 * re-declared on either side cannot do without this seeing it.
 */
describe("a Resource file holds the Resource's rules", () => {
  const [fileMarkdown, fileReference, fileSpace, fileImage, fileUr] = resourceFileSchema.options;
  const [markdown, reference, space, image, ur] = resourceSchema.options;

  it('declares the kinds the Resource does, in the same order', () => {
    const kindsOf = (options: readonly { shape: { kind: { value: string } } }[]) =>
      options.map((option) => option.shape.kind.value);
    expect(kindsOf(resourceFileSchema.options)).toEqual(kindsOf(resourceSchema.options));
    expect(resourceFileSchema.options).toHaveLength(5);
  });

  it("shares every kind's id and Title, differing only in its kind literal and content", () => {
    const pairs = [
      [fileMarkdown, markdown],
      [fileReference, reference],
      [fileSpace, space],
      [fileImage, image],
      [fileUr, ur],
    ] as const;
    for (const [file, resource] of pairs) {
      expect(unshared(file.shape, resource.shape)).toEqual(['content', 'kind']);
    }
  });

  it('shares every content rule of the kinds whose file holds their content', () => {
    expect(unshared(fileReference.shape.content.shape, reference.shape.content.shape)).toEqual([]);
    expect(unshared(fileUr.shape.content.shape, ur.shape.content.shape)).toEqual([]);
    expect(unshared(fileSpace.shape.content.shape, space.shape.content.shape)).toEqual(['framing']);
    expect(
      unshared(
        fileSpace.shape.content.shape.framing.unwrap().shape,
        space.shape.content.shape.framing.unwrap().shape,
      ),
    ).toEqual([]);
    expect(unshared(fileImage.shape.content.shape, image.shape.content.shape)).toEqual([
      'naturalSize',
    ]);
    expect(
      unshared(
        fileImage.shape.content.shape.naturalSize.unwrap().shape,
        image.shape.content.shape.naturalSize.unwrap().shape,
      ),
    ).toEqual([]);
  });

  it("holds a Markdown Resource's sidecar locator in place of its source", () => {
    expect(fileMarkdown.shape.content).toBe(markdownFileContentSchema);
    expect(markdown.shape.content).toBe(markdownResourceContentSchema);
  });

  it('refuses a key the Resource would strip, inside the content and outside it', () => {
    const resource = {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      kind: 'reference',
      content: { target: '00000000-0000-4000-8000-000000000003' },
    };
    expect(resourceFileSchema.safeParse(resource).success).toBe(true);
    for (const extended of [
      { ...resource, extra: 1 },
      { ...resource, content: { ...resource.content, extra: 1 } },
    ]) {
      expect(resourceFileSchema.safeParse(extended).success).toBe(false);
      expect(resourceSchema.safeParse(extended).success).toBe(true);
    }
  });
});
