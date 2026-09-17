import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CONTEXT.md defines the vocabulary twice over for a Reference Thing — once under
 * **Reference Thing**, which says what authoring one changes, and once under **Opening**,
 * which says what bringing one up puts on screen — and the two drifted apart.
 * The Reference Thing definition was moved to ADR 0049's model (a Reference Thing authors its own
 * Title and Target; the Target is opened explicitly to author its content)
 * while the Opening definition kept ADR 0039/0046's withdrawn one, in which a
 * Reference Thing opened "the same content surface through its target". Both ADRs are
 * still `accepted` and carry `Refined by: 0049`, so an ADR status scan cannot
 * see the drift, and neither can `tsc`: a definition is prose, and prose that
 * describes a surface nobody built compiles perfectly.
 *
 * The code is unambiguous about which one is live — `ReferenceEditorForm` renders a
 * Title input and a Target picker and the props of the Reference Thing branch make a
 * content field unrepresentable — so this reads the document against the
 * decision rather than against the other document, in the idiom
 * `current-domain-vocabulary.test.ts` and `conflict-markers.test.ts` already
 * established here: scan the tracked file itself, because nothing else in
 * `pnpm verify` opens it.
 */

const context = readFileSync(fileURLToPath(new URL('../../CONTEXT.md', import.meta.url)), 'utf8');

/**
 * The prose under a `**Term**:` heading, up to the `_Avoid_:` line that closes
 * every definition. Throwing rather than returning empty matters: a heading
 * renamed out from under this test would otherwise pass it vacuously, which is
 * the failure mode a document scan is most prone to.
 */
const definitionOf = (term: string): string => {
  const heading = `**${term}**:`;
  const start = context.indexOf(heading);
  expect(start, `CONTEXT.md declares no ${term} definition`).toBeGreaterThan(-1);
  const body = context.slice(start + heading.length);
  const end = body.indexOf('\n_Avoid_:');
  expect(end, `the ${term} definition carries no _Avoid_ line`).toBeGreaterThan(-1);
  return body.slice(0, end).trim();
};

/**
 * The Opening definition names each Thing kind in its own semicolon-separated
 * clause. Reading the Reference Thing one alone is what keeps the assertions honest: the
 * Markdown clause beside it legitimately says *title*, so a whole-paragraph
 * match for that word would pass while saying nothing about a Reference Thing at all.
 */
const referenceClause = (definition: string): string => {
  const clauses = definition.split(';').filter((clause) => /reference/i.test(clause));
  expect(clauses, 'the Opening definition says nothing about a reference thing').not.toHaveLength(
    0,
  );
  return clauses.join(' ');
};

/**
 * The two names the withdrawn model gave itself: ADR 0039's *delegation* and
 * the shared editor CONTEXT.md called a *content surface*. The ban is
 * deliberately this narrow, and the positive assertions above carry the
 * semantic weight instead.
 *
 * A wider one is worse than useless here. "The same content" reads as the
 * withdrawn model in a sentence about opening, but it is also how the **Reference Thing**
 * definition states the domain fact that a Reference Thing *shows* its Target's content
 * — one source of truth, appearing again elsewhere — which is true, live, and
 * the whole point of the kind. A marker that cannot tell showing from
 * authoring fails the correct document.
 *
 * A third pattern closes a real gap the first two leave open: neither
 * "content surface" nor "delegat" appears if the withdrawn model resurfaces
 * paraphrased, as "opening a Reference Thing opens its Target's content for
 * authoring". That phrase cannot be banned by "opens … Target's content"
 * alone, because that is also exactly how the live text describes the correct
 * model — "A Reference Thing opens on its own Title and its immutable
 * Target's content read-only" is `opens … Target's content` in one breath
 * too. What tells them apart is whether an authoring purpose sits in the same
 * clause as "Target's content": the live text never puts one there — its
 * "read-only" ends the clause at a comma, and its "opened explicitly to
 * author" is a separate clause about the Target, not the Reference Thing's
 * own opening. So the third pattern matches "Target's content" only when
 * followed, before the next comma, period or semicolon, by "to author" or
 * "for authoring". Checked against the live document (both the Opening
 * definition's reference clause and the Reference Thing definition) so this
 * note asserts an absence actually confirmed, not assumed.
 */
const DELEGATED_CONTENT = [
  /content surface/i,
  /delegat/i,
  /target's content[^,.;]*\b(?:to author|for authoring)\b/i,
];

/**
 * ADR 0049's model, read as the shape both clauses actually share rather than
 * as the one adverb, "explicitly", that only the Opening definition still
 * carries. CONTEXT.md's ADR 0092 rewrite reworded the Reference Thing
 * definition to "the Target is opened to author that content" — the same
 * fact, that the Target takes a distinct step to author, stated without that
 * word. What this guards is the fact, not the adverb: `target` has to be the
 * subject of `opened`, so a sentence that opens the Reference Thing and only
 * mentions its Target later does not count. `must` is left off for the same
 * reason as `explicitly` — the Reference Thing definition does not use it.
 */
const SEPARATELY_OPENED = /target[^.;]*opened[^.;]*to author/i;

describe('CONTEXT.md on opening a Reference Thing', () => {
  it('limits a Reference Thing to its own title and target', () => {
    const clause = referenceClause(definitionOf('Opening'));

    expect(clause).toMatch(/title/i);
    expect(clause).toMatch(/target/i);
  });

  it('sends an author to the Target Thing itself to author its content', () => {
    expect(referenceClause(definitionOf('Opening'))).toMatch(SEPARATELY_OPENED);
    expect('A Reference Thing is opened to author its Title').not.toMatch(SEPARATELY_OPENED);
    expect('the Target is opened to author that content').toMatch(SEPARATELY_OPENED);
  });

  it('does not describe a Reference Thing as opening its Target’s content', () => {
    const clause = referenceClause(definitionOf('Opening'));

    for (const withdrawn of DELEGATED_CONTENT) {
      expect(clause, `the Opening definition restates ADR 0039/0046's withdrawn model`).not.toMatch(
        withdrawn,
      );
    }
  });

  /**
   * The drift this file exists for was between two definitions, so the Reference Thing
   * one is held to the same rule rather than trusted for having been fixed
   * first. It is the definition that states the rule outright, and it is where
   * a future edit would most plausibly reintroduce delegation.
   */
  it('agrees with the Reference Thing definition', () => {
    const reference = definitionOf('Reference Thing');

    expect(reference).toMatch(/title/i);
    expect(reference).toMatch(/target/i);
    expect(reference).toMatch(SEPARATELY_OPENED);
    for (const withdrawn of DELEGATED_CONTENT) {
      expect(reference).not.toMatch(withdrawn);
    }
  });
});
