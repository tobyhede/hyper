import { describe, expect, it } from 'vitest';
import type { ZodRawShape } from 'zod';
import { markdownResourceDocumentSchema, markdownResourceSchema } from '../src/index';

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
 * Only the markdown pair is guarded because Markdown is the authorable content
 * document. An Open Reference Resource reuses its Target's renderer read-only.
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
   * The table is the edges of the Title and body rules and nothing else:
   * a Resource's Title normalizes and must keep one non-empty line, which is what
   * `min(1)` means, so a title of spaces is refused where a
   * title with one is kept and trimmed; a body is required and may be empty.
   * Every combination is asserted both ways,
   * because a divergence in either direction is a document that round-trips
   * through storage and then cannot be completed.
   */
  const titles = ['', ' ', '   ', 'A', ' A '];
  const bodies = [undefined, '', 'source'];
  const kinds = [undefined, 'markdown', 'reference'];

  /** One combination from the title/body/kind product, present only when drawn. */
  interface CandidateDocument {
    title: string;
    body?: string;
    kind?: string;
  }

  it('accepts a document exactly when the resource accepts it with an id', () => {
    const disagreements: string[] = [];
    let examined = 0;
    for (const title of titles) {
      for (const body of bodies) {
        for (const kind of kinds) {
          const document: CandidateDocument = { title };
          if (body !== undefined) document.body = body;
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
