import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CONTEXT.md defines the vocabulary twice over for an Alias — once under
 * **Alias**, which says what authoring one changes, and once under **Opening**,
 * which says what bringing one up puts on screen — and the two drifted apart.
 * The Alias definition was moved to ADR 0049's model (an Alias authors its own
 * Title and Target; the Target is opened explicitly to author its content)
 * while the Opening definition kept ADR 0039/0046's withdrawn one, in which an
 * Alias opened "the same content surface through its target". Both ADRs are
 * still `accepted` and carry `Refined by: 0049`, so an ADR status scan cannot
 * see the drift, and neither can `tsc`: a definition is prose, and prose that
 * describes a surface nobody built compiles perfectly.
 *
 * The code is unambiguous about which one is live — `AliasEditorForm` renders a
 * Title input and a Target picker and the props of the Alias branch make a
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
 * The Opening definition names each Card kind in its own semicolon-separated
 * clause. Reading the Alias one alone is what keeps the assertions honest: the
 * Markdown clause beside it legitimately says *title*, so a whole-paragraph
 * match for that word would pass while saying nothing about an Alias at all.
 */
const aliasClause = (definition: string): string => {
  const clauses = definition.split(';').filter((clause) => /alias/i.test(clause));
  expect(clauses, 'the Opening definition says nothing about an alias').not.toHaveLength(0);
  return clauses.join(' ');
};

/**
 * The two names the withdrawn model gave itself: ADR 0039's *delegation* and
 * the shared editor CONTEXT.md called a *content surface*. The ban is
 * deliberately this narrow, and the positive assertions above carry the
 * semantic weight instead.
 *
 * A wider one is worse than useless here. "The same content" reads as the
 * withdrawn model in a sentence about opening, but it is also how the **Alias**
 * definition states the domain fact that an Alias *shows* its Target's content
 * — one source of truth, appearing again elsewhere — which is true, live, and
 * the whole point of the kind. A marker that cannot tell showing from
 * authoring fails the correct document.
 */
const DELEGATED_CONTENT = [/content surface/i, /delegat/i];

describe('CONTEXT.md on opening an Alias', () => {
  it('limits an Alias to its own title and target', () => {
    const clause = aliasClause(definitionOf('Opening'));

    expect(clause).toMatch(/title/i);
    expect(clause).toMatch(/target/i);
  });

  it('sends an author to the Target Card itself to author its content', () => {
    expect(aliasClause(definitionOf('Opening'))).toMatch(/explicit/i);
  });

  it('does not describe an Alias as opening its Target’s content', () => {
    const clause = aliasClause(definitionOf('Opening'));

    for (const withdrawn of DELEGATED_CONTENT) {
      expect(clause, `the Opening definition restates ADR 0039/0046's withdrawn model`).not.toMatch(
        withdrawn,
      );
    }
  });

  /**
   * The drift this file exists for was between two definitions, so the Alias
   * one is held to the same rule rather than trusted for having been fixed
   * first. It is the definition that states the rule outright, and it is where
   * a future edit would most plausibly reintroduce delegation.
   */
  it('agrees with the Alias definition', () => {
    const alias = definitionOf('Alias');

    expect(alias).toMatch(/title/i);
    expect(alias).toMatch(/target/i);
    expect(alias).toMatch(/explicit/i);
    for (const withdrawn of DELEGATED_CONTENT) {
      expect(alias).not.toMatch(withdrawn);
    }
  });
});
