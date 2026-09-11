import type { Thing } from '@project/core';
import { AliasIcon, BASE_GLYPHS, type ThingBaseKind } from './icons';

/**
 * What kind of Thing this is, drawn rather than described.
 *
 * Persistent, not a hover affordance: a Thing's kind is a fact about it, and an
 * Alias that only announces itself under the pointer is one an author has to
 * hunt for. It is the same glyph wherever a Thing appears — on its Front, and in
 * the Target picker's results — so recognising one teaches the other.
 *
 * Adding a Thing kind is a compile-time obligation here: both records are keyed
 * by the domain union, so a new kind fails to build until it has a glyph and a
 * name rather than silently drawing as nothing.
 */

const KIND_NAMES = {
  markdown: 'Markdown Thing',
  alias: 'Alias',
  space: 'Space Thing',
} satisfies Record<Thing['kind'], string>;

/**
 * What an Alias announces once its Target's kind is known. The glyph carries
 * the distinction, so the accessible name has to carry it too — otherwise the
 * two draw differently and announce identically.
 */
const ALIAS_NAMES = {
  markdown: 'Alias of a Markdown Thing',
  space: 'Alias of a Space Thing',
} satisfies Record<ThingBaseKind, string>;

/**
 * What this kind of Thing is called, for a surface that names one in words
 * rather than drawing it. The same names the glyph announces, so a Thing's kind
 * reads identically however it is reached.
 */
export const thingKindName = (kind: Thing['kind']): string => KIND_NAMES[kind];

export interface ThingKindIconProps {
  readonly kind: Thing['kind'];
  /**
   * For an Alias, the kind of the Thing it points at.
   *
   * The badge is drawn over that kind's glyph, so an Alias of a Space Thing and
   * an Alias of a Markdown Thing are told apart — which a single Alias glyph
   * could not do, and which is the whole reason the Alias is a decoration.
   * Absent, an Alias draws over the Markdown base; it is also ignored for the
   * other two kinds, which are not Aliases of anything.
   */
  readonly aliasOf?: ThingBaseKind | undefined;
  readonly size?: number | undefined;
  /**
   * Draw the glyph as a mark and nothing else: no accessible name, and no
   * tooltip either.
   *
   * For the one case the default is wrong: a control that **already names the
   * command it performs**, where the glyph repeats a fact the button has
   * stated. The Command Dock's three Create controls are that — each is
   * labelled `Create <kind>`, so an `img` announcing `<kind>` beside it is a
   * second node saying half of what the button just said, and a `title` of
   * `<kind>` is worse: the glyph fills the button, so that tooltip is the one
   * the pointer gets and `Create Alias` hovers as `Alias`.
   *
   * It is deliberately not the default. Everywhere else the glyph carries the
   * kind *on its own* — on a Thing's own Front, in the Target picker's results,
   * on a list row — and there the name is the whole point of the element.
   */
  readonly decorative?: boolean | undefined;
}

/**
 * The glyph for one Thing: a table lookup for the kinds that own a silhouette,
 * and a composition for the one that does not.
 *
 * `alias` is the composition — it draws one of the other silhouettes with a
 * badge on it, because it needs a second input, which kind it is an Alias of,
 * that the others do not have. Everything else is {@link BASE_GLYPHS}, keyed by
 * the domain union with `alias` subtracted, and **that lookup is what makes
 * adding a kind a compile-time obligation**. Picking between the two with
 * `kind === 'space' ? … : …` read as the same composition and was not: it gave
 * every future kind the Markdown silhouette by default, silently, while this
 * file's own doc still promised a build failure.
 */
function KindGlyph({ kind, aliasOf, size }: ThingKindIconProps) {
  // `size` is forwarded even when absent: every one of these declares its own
  // default by destructuring, and a destructuring default is what `undefined`
  // selects — so passing it through preserves omission rather than overriding
  // it, and no conditional spread is needed to say so.
  if (kind === 'alias') return <AliasIcon base={aliasOf ?? 'markdown'} size={size} />;
  const Base = BASE_GLYPHS[kind];
  return <Base size={size} />;
}

/**
 * The glyph carries the name twice — as an `aria-label` on an `img` role, which
 * is what a screen reader announces, and as a `title`, which is what a pointer
 * hovering it sees. The SVG underneath stays `aria-hidden`, so the two do not
 * both reach the accessibility tree.
 *
 * **Decorative carries neither, and the `title` is the reason it cannot.** A
 * decorative glyph is inside a control that has already named the command it
 * performs, and the glyph fills that control — so it is the node the pointer is
 * over, and its own `title` is the tooltip that appears instead of the button's.
 * Hovering `Create Alias` would read `Alias`: the noun, in a slot that performs
 * a verb. Withholding it is what lets the button's own name reach the pointer as
 * well as the screen reader.
 */

export function ThingKindIcon({ kind, aliasOf, size, decorative = false }: ThingKindIconProps) {
  // Named only where a name is drawn: the decorative arm announces nothing and
  // shows the pointer nothing, so deriving one for it would be a value that
  // exists to be discarded.
  if (decorative)
    return (
      <span
        className="inline-flex flex-none items-center text-[var(--muted-foreground)]"
        aria-hidden="true"
        data-thing-kind={kind}
        data-alias-of={kind === 'alias' ? aliasOf : undefined}
      >
        <KindGlyph kind={kind} aliasOf={aliasOf} size={size} />
      </span>
    );
  const name = kind === 'alias' && aliasOf !== undefined ? ALIAS_NAMES[aliasOf] : KIND_NAMES[kind];
  return (
    <span
      className="inline-flex flex-none items-center text-[var(--muted-foreground)]"
      role="img"
      aria-label={name}
      title={name}
      data-thing-kind={kind}
      data-alias-of={kind === 'alias' ? aliasOf : undefined}
    >
      <KindGlyph kind={kind} aliasOf={aliasOf} size={size} />
    </span>
  );
}
