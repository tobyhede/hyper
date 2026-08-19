import { describe, expect, it } from 'vitest';
import type { ZodRawShape } from 'zod';
import { markdownCardDocumentSchema, markdownCardSchema } from '../src/index';

/**
 * The stored document is the whole markdown Card less its id, and something has
 * to say so.
 *
 * `markdownCardDocumentSchema` is written as `markdownCardSchema.omit({ id:
 * true })`, so the equality holds by construction today — and that is exactly
 * why it is worth pinning. Nothing stops the day the document schema is
 * re-declared beside the card schema, or one of them gains a rule the other
 * does not, and from then on the two agree on nothing but their author's
 * intention.
 *
 * What that costs is a long way from here. The opened-Card pane authors a
 * delegated Card's *content*: it draws no title field, so it passes the stored
 * title straight through and validates the result with `markdownCardSchema` —
 * and it has nowhere to report a title refusal, because there is no title field
 * and no node beside one. A stored title the document schema accepts and the
 * card schema refuses therefore surfaces as a `Done` button that does nothing
 * and says nothing. `OpenCard` carries a generic fallback message for exactly
 * that, and the fallback is the second line of defence; this is the first.
 *
 * Test-only on purpose. The equality is a property of two declarations, not a
 * rule either could carry, and a runtime assertion inside `core` would be
 * checking its own source at import time.
 *
 * Only the markdown pair is guarded, because only that one is passed through an
 * authoring surface that cannot report its own refusal. The alias pair is built
 * the same way and earns the same guard the day an Alias document takes the
 * same shape.
 */
describe('a stored markdown document is the card less its id', () => {
  const CARD_ID = '00000000-0000-4000-8000-000000000002';

  it('drops the id and keeps every other field', () => {
    expect(Object.keys(markdownCardDocumentSchema.shape).sort()).toEqual(
      Object.keys(markdownCardSchema.shape)
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
   * the pane builds the object it validates key by key (`OpenCard.tsx`), so no
   * unknown key can reach `markdownCardSchema` along the path this file exists
   * to guard, and a mode the two disagree about cannot produce the silent
   * `Done`. `omit` carries the mode across anyway — both are `strip` — so a
   * divergence there needs the same standalone re-declaration that (2) already
   * refuses.
   */
  it('shares one instance of every rule with the card schema', () => {
    const cardFieldSchemas: ZodRawShape = markdownCardSchema.shape;
    for (const [field, schema] of Object.entries(markdownCardDocumentSchema.shape)) {
      expect(schema, `the document's "${field}" is not the card's`).toBe(cardFieldSchemas[field]);
    }
  });

  /**
   * What sharing those instances buys, said in values rather than references.
   *
   * The table is the edges of the rules the pane depends on and nothing else:
   * `min(1)` counts characters, so a title of spaces is valid at rest and a
   * title of none is not; a body is required and may be empty. Every
   * combination is asserted both ways,
   * because a divergence in either direction is a document that round-trips
   * through storage and then cannot be completed.
   */
  const titles = ['', ' ', '   ', 'A', ' A '];
  const bodies = [undefined, '', 'source'];
  const kinds = [undefined, 'markdown', 'alias'];

  /** One combination from the title/body/kind product, present only when drawn. */
  interface CandidateDocument {
    title: string;
    body?: string;
    kind?: string;
  }

  it('accepts a document exactly when the card accepts it with an id', () => {
    const disagreements: string[] = [];
    let examined = 0;
    for (const title of titles) {
      for (const body of bodies) {
        for (const kind of kinds) {
          const document: CandidateDocument = { title };
          if (body !== undefined) document.body = body;
          if (kind !== undefined) document.kind = kind;
          examined += 1;
          const asDocument = markdownCardDocumentSchema.safeParse(document);
          const asCard = markdownCardSchema.safeParse({ ...document, id: CARD_ID });
          if (asDocument.success !== asCard.success) {
            disagreements.push(
              `${JSON.stringify(document)}: document ${asDocument.success}, card ${asCard.success}`,
            );
            continue;
          }
          if (asDocument.success && asCard.success) {
            expect(asCard.data).toEqual({ ...asDocument.data, id: CARD_ID });
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
     *
     * It is also the one number written down twice. The issue that resolved
     * this file quotes it, and quoted a shorter enumeration beside it for as
     * long as nothing tied the two together; change the table and this says
     * which number the prose now owes.
     */
    expect(examined).toBe(45);
  });
});
