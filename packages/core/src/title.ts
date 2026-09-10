/**
 * Reading a Thing's Title (ADR 0083).
 *
 * A Title is one or more **Title Lines**, stored as it always was — one string
 * on the Thing document — with the newlines inside it load-bearing. The first
 * line is the Thing's **name**; the lines after it qualify it on the Thing front.
 *
 * The structure therefore lives in a `string` and nothing in the type says so,
 * which is exactly why the reading of one is a named domain operation here
 * rather than a `split('\n')` at each of the surfaces that draw, list or search
 * a Thing. The roles below are domain knowledge and not a renderer's positional
 * convention: what an author's second line means is settled once, in this
 * module.
 */

/**
 * What a Title Line is for, in the order the lines are written.
 *
 * There is no fourth role and no cap on the count. Letting the scale bottom out
 * and repeat is the HTML analogy running correctly — there is no `h7`, and `p`
 * repeats — and refusing a fourth line would mean arguing with an author
 * mid-keystroke about a limit they cannot see (ADR 0083).
 */
export type TitleLineRole = 'title' | 'subtitle' | 'caption';

/** One line of a Title, with the role its position gives it. */
export interface TitleLine {
  readonly role: TitleLineRole;
  readonly text: string;
}

/**
 * The stable identity of a Title that carries no name (ADR 0057, ADR 0083).
 *
 * The domain owns the code and the application composes the wording: a schema
 * that refuses a Title says which rule refused it and never what to tell the
 * author. It rides on the Zod issue's `params` rather than its `message` for
 * that reason — a message is prose, and prose here would be a sentence no
 * surface could reword.
 */
export const THING_TITLE_REQUIRED = 'thing-title-required';

/** Which rung of the ladder the line at `index` takes. */
const roleAt = (index: number): TitleLineRole =>
  index === 0 ? 'title' : index === 1 ? 'subtitle' : 'caption';

/**
 * The Title as it is stored, from the Title as it was typed or written down.
 *
 * Normalization belongs to the boundary a Title is *parsed* at — the schemas in
 * `schema.ts`, and through them `loadSpace` and the Thing file parser — so a
 * stored Title and an imported one get the same answer and no consumer
 * normalizes again on the way to a screen.
 *
 * Four rules, and the fourth is the one worth stating: CRLF and a lone CR fold
 * to LF, every line loses its trailing whitespace, leading and trailing blank
 * lines are dropped, and **interior blank lines are kept verbatim** — an author
 * who left a gap meant it. Leading whitespace is a line's own and survives.
 *
 * A Title of nothing but whitespace normalizes to the empty string, which is
 * what {@link THING_TITLE_REQUIRED} refuses. Answering that rather than throwing
 * keeps this operation total: a draft mid-edit is a legitimate value to ask
 * about, and the refusal is the schema's to raise.
 */
export const normalizeTitle = (title: string): string => {
  const lines = title
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
  let first = 0;
  let past = lines.length;
  // A blank line is one this pass has already emptied of its whitespace.
  while (first < past && lines[first] === '') first += 1;
  while (past > first && lines[past - 1] === '') past -= 1;
  return lines.slice(first, past).join('\n');
};

/**
 * The Title read as its lines, each with its role.
 *
 * Written for a Title that has come through the schema, which is every Title on
 * a Thing in a loaded Space. It does not normalize: normalization is the
 * boundary's, and doing it again here would be the same rule living in two
 * places, which is the thing this module exists to prevent.
 */
export const titleLines = (title: string): readonly TitleLine[] =>
  title.split('\n').map((text, index) => ({ role: roleAt(index), text }));

/**
 * The Thing's name: the first line of its Title.
 *
 * Nearly every consumer wants this one and no other — every surface that lists
 * or refers to a Thing shows the name, and only the Thing front draws the ladder
 * (ADR 0083). It exists so that nobody writes `titleLines(title)[0].text`, an
 * expression that is both a positional convention restated and, under
 * `noUncheckedIndexedAccess`, a possibly-undefined value at every call site.
 */
export const titleName = (title: string): string => {
  const firstBreak = title.indexOf('\n');
  return firstBreak === -1 ? title : title.slice(0, firstBreak);
};
