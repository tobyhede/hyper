import type { Resource } from '@project/core';
import { ReferenceIcon, BASE_GLYPHS, type ResourceBaseKind } from './icons';

/**
 * What kind of Resource this is, drawn rather than described.
 *
 * Persistent, not a hover affordance: a Resource's kind is a fact about it, and a
 * Reference Resource that only announces itself under the pointer is one an author has to
 * hunt for. It is the same glyph wherever a Resource appears — on its Front, and in
 * the Resources list — so recognising one teaches the other.
 *
 * Adding a Resource kind is a compile-time obligation here: both records are keyed
 * by the domain union, so a new kind fails to build until it has a glyph and a
 * name rather than silently drawing as nothing.
 */

const KIND_NAMES = {
  markdown: 'Markdown Resource',
  reference: 'Reference Resource',
  space: 'Space Resource',
} satisfies Record<Resource['kind'], string>;

/**
 * What a Reference Resource announces once its Target's kind is known. The glyph carries
 * the distinction, so the accessible name has to carry it too — otherwise the
 * two draw differently and announce identically.
 */
const REFERENCE_NAMES = {
  markdown: 'Reference to a Markdown Resource',
  space: 'Reference to a Space Resource',
} satisfies Record<ResourceBaseKind, string>;

/**
 * What this kind of Resource is called, for a surface that names one in words
 * rather than drawing it. The same names the glyph announces, so a Resource's kind
 * reads identically however it is reached.
 */
export const resourceKindName = (kind: Resource['kind']): string => KIND_NAMES[kind];

export interface ResourceKindIconProps {
  readonly kind: Resource['kind'];
  /**
   * For a Reference Resource, the kind of the Resource it points at.
   *
   * The badge is drawn over that kind's glyph, so a Reference to a Space Resource and
   * a Reference to a Markdown Resource are told apart — which a single Reference Resource glyph
   * could not do, and which is the whole reason the Reference Resource is a decoration.
   * Absent, a Reference Resource draws over the Markdown base; it is also ignored for the
   * other two kinds, which are not Reference Resources of anything.
   */
  readonly referenceOf?: ResourceBaseKind | undefined;
  readonly size?: number | undefined;
  /**
   * Draw the glyph as a mark and nothing else: no accessible name, and no
   * tooltip either.
   *
   * For the one case the default is wrong: a control that **already names the
   * command it performs**, where the glyph repeats a fact the button has
   * stated. The Command Dock's Create controls and the Create Reference command
   * are that — each is labelled `Create <kind>`, so an `img` announcing `<kind>` beside it is a
   * second node saying half of what the button just said, and a `title` of
   * `<kind>` is worse: the glyph fills the button, so that tooltip is the one
   * the pointer gets and `Create Reference` hovers as `Reference Resource`.
   *
   * It is deliberately not the default. Everywhere else the glyph carries the
   * kind *on its own* — on a Resource's own Front, on a list row — and there the name is the whole point of the element.
   */
  readonly decorative?: boolean | undefined;
}

/**
 * The glyph for one Resource: a table lookup for the kinds that own a silhouette,
 * and a composition for the one that does not.
 *
 * `reference` is the composition — it draws one of the other silhouettes with a
 * badge on it, because it needs a second input, which kind it is a Reference Resource of,
 * that the others do not have. Everything else is {@link BASE_GLYPHS}, keyed by
 * the domain union with `reference` subtracted, and **that lookup is what makes
 * adding a kind a compile-time obligation**. Do not pick between the two with
 * `kind === 'space' ? … : …`: that gives every future kind the Markdown
 * silhouette by default, silently, instead of a build failure.
 */
function KindGlyph({ kind, referenceOf, size }: ResourceKindIconProps) {
  // `size` is forwarded even when absent: every one of these declares its own
  // default by destructuring, and a destructuring default is what `undefined`
  // selects — so passing it through preserves omission rather than overriding
  // it, and no conditional spread is needed to say so.
  if (kind === 'reference') return <ReferenceIcon base={referenceOf ?? 'markdown'} size={size} />;
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
 * Hovering `Create Reference` would read `Reference Resource`: the noun, in a slot that performs
 * a verb. Withholding it is what lets the button's own name reach the pointer as
 * well as the screen reader.
 */

export function ResourceKindIcon({
  kind,
  referenceOf,
  size,
  decorative = false,
}: ResourceKindIconProps) {
  // Named only where a name is drawn: the decorative arm announces nothing and
  // shows the pointer nothing, so deriving one for it would be a value that
  // exists to be discarded.
  if (decorative)
    return (
      <span
        className="inline-flex flex-none items-center text-muted-foreground"
        aria-hidden="true"
        data-resource-kind={kind}
        data-reference-of={kind === 'reference' ? referenceOf : undefined}
      >
        <KindGlyph kind={kind} referenceOf={referenceOf} size={size} />
      </span>
    );
  const name =
    kind === 'reference' && referenceOf !== undefined
      ? REFERENCE_NAMES[referenceOf]
      : KIND_NAMES[kind];
  return (
    <span
      className="inline-flex flex-none items-center text-muted-foreground"
      role="img"
      aria-label={name}
      title={name}
      data-resource-kind={kind}
      data-reference-of={kind === 'reference' ? referenceOf : undefined}
    >
      <KindGlyph kind={kind} referenceOf={referenceOf} size={size} />
    </span>
  );
}
