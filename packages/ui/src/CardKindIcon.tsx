import type { Card } from '@project/core';
import { AliasIcon, BASE_GLYPHS, type CardBaseKind } from './icons';

/**
 * What kind of Card this is, drawn rather than described.
 *
 * Persistent, not a hover affordance: a Card's kind is a fact about it, and an
 * Alias that only announces itself under the pointer is one an author has to
 * hunt for. It is the same glyph wherever a Card appears — on its Front, and in
 * the Target picker's results — so recognising one teaches the other.
 *
 * Adding a Card kind is a compile-time obligation here: both records are keyed
 * by the domain union, so a new kind fails to build until it has a glyph and a
 * name rather than silently drawing as nothing.
 */

const KIND_NAMES = {
  markdown: 'Markdown Card',
  alias: 'Alias',
  space: 'Space Card',
} satisfies Record<Card['kind'], string>;

/**
 * What an Alias announces once its Target's kind is known. The glyph carries
 * the distinction, so the accessible name has to carry it too — otherwise the
 * two draw differently and announce identically.
 */
const ALIAS_NAMES = {
  markdown: 'Alias of a Markdown Card',
  space: 'Alias of a Space Card',
} satisfies Record<CardBaseKind, string>;

/**
 * What this kind of Card is called, for a surface that names one in words
 * rather than drawing it. The same names the glyph announces, so a Card's kind
 * reads identically however it is reached.
 */
export const cardKindName = (kind: Card['kind']): string => KIND_NAMES[kind];

export interface CardKindIconProps {
  readonly kind: Card['kind'];
  /**
   * For an Alias, the kind of the Card it points at.
   *
   * The badge is drawn over that kind's glyph, so an Alias of a Space Card and
   * an Alias of a Markdown Card are told apart — which a single Alias glyph
   * could not do, and which is the whole reason the Alias is a decoration.
   * Absent, an Alias draws over the Markdown base; it is also ignored for the
   * other two kinds, which are not Aliases of anything.
   */
  readonly aliasOf?: CardBaseKind | undefined;
  readonly size?: number | undefined;
}

/**
 * The glyph for one Card: a table lookup for the kinds that own a silhouette,
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
function KindGlyph({ kind, aliasOf, size }: CardKindIconProps) {
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
 */

export function CardKindIcon({ kind, aliasOf, size }: CardKindIconProps) {
  const name = kind === 'alias' && aliasOf !== undefined ? ALIAS_NAMES[aliasOf] : KIND_NAMES[kind];
  return (
    <span
      className="inline-flex flex-none items-center text-[var(--muted-foreground)]"
      role="img"
      aria-label={name}
      title={name}
      data-card-kind={kind}
      data-alias-of={kind === 'alias' ? aliasOf : undefined}
    >
      <KindGlyph kind={kind} aliasOf={aliasOf} size={size} />
    </span>
  );
}
