import type { Resource } from '@project/core';
import { kindNaming } from './kinds/registry';
import { BADGED_TARGET_GLYPH } from './kinds/kind-view';
import { ReferenceIcon, type ResourceBaseKind } from './icons';

/**
 * What kind of Resource this is, drawn rather than described.
 *
 * Persistent, not a hover affordance: a Resource's kind is a fact about it, and a
 * Reference Resource that only announces itself under the pointer is one an author has to
 * hunt for. It is the same glyph wherever a Resource appears — on the drawn Resource, and in
 * the Resources list — so recognising one teaches the other.
 *
 * Each kind's view half (`kinds/`) gives its glyph and its names, and the
 * registry types every kind's view half, so a new kind fails to build until
 * it has a name rather than silently drawing as nothing.
 */

/**
 * What this kind of Resource is called, for a surface that names one in words
 * rather than drawing it. The same names the glyph announces, so a Resource's kind
 * reads identically however it is reached.
 */
export const resourceKindName = (kind: Resource['kind']): string => kindNaming(kind).name;

export interface ResourceKindIconProps {
  readonly kind: Resource['kind'];
  /**
   * For a Reference Resource, the kind of the Resource it points at.
   *
   * The badge is drawn over that kind's glyph, so a Reference to a Space Resource and
   * a Reference to a Markdown Resource are told apart — which a single Reference Resource glyph
   * could not do, and which is the whole reason the Reference Resource is a decoration.
   * Absent, a Reference Resource draws over the Markdown glyph; it is ignored for
   * a kind with a silhouette of its own, which is a Reference Resource of nothing.
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
   * kind *on its own* — on the drawn Resource, on a list row — and there the name is the whole point of the element.
   */
  readonly decorative?: boolean | undefined;
}

/**
 * The glyph for one Resource: its kind's own silhouette, or, for a kind that
 * draws none of its own, a composition.
 *
 * A Reference Resource is the composition: it draws its Target's silhouette
 * with a badge on it, because it needs a second input, which kind it is a
 * Reference Resource of, that the others do not have. What a Reference
 * Resource announces once its Target's kind is known is that kind's
 * `referenceName`: the glyph carries the distinction, so the accessible name
 * has to carry it too.
 */
function KindGlyph({ kind, referenceOf, size }: ResourceKindIconProps) {
  // `size` is forwarded even when absent: every one of these declares its own
  // default by destructuring, and a destructuring default is what `undefined`
  // selects — so passing it through preserves omission rather than overriding
  // it, and no conditional spread is needed to say so.
  const { Glyph } = kindNaming(kind);
  if (Glyph !== BADGED_TARGET_GLYPH) return <Glyph size={size} />;
  const Base = referenceOf === undefined ? undefined : kindNaming(referenceOf).Glyph;
  return <ReferenceIcon Base={Base === BADGED_TARGET_GLYPH ? undefined : Base} size={size} />;
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
  const naming = kindNaming(kind);
  const badged = naming.Glyph === BADGED_TARGET_GLYPH;
  // Named only where a name is drawn: the decorative arm announces nothing and
  // shows the pointer nothing, so deriving one for it would be a value that
  // exists to be discarded.
  if (decorative)
    return (
      <span
        className="inline-flex flex-none items-center text-muted-foreground"
        aria-hidden="true"
        data-resource-kind={kind}
        data-reference-of={badged ? referenceOf : undefined}
      >
        <KindGlyph kind={kind} referenceOf={referenceOf} size={size} />
      </span>
    );
  const name =
    badged && referenceOf !== undefined
      ? (kindNaming(referenceOf).referenceName ?? naming.name)
      : naming.name;
  return (
    <span
      className="inline-flex flex-none items-center text-muted-foreground"
      role="img"
      aria-label={name}
      title={name}
      data-resource-kind={kind}
      data-reference-of={badged ? referenceOf : undefined}
    >
      <KindGlyph kind={kind} referenceOf={referenceOf} size={size} />
    </span>
  );
}
