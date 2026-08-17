import type { ComponentType } from 'react';
import type { Card } from '@project/core';
import { AliasIcon, MarkdownIcon } from './icons';

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

const KIND_GLYPHS = {
  markdown: MarkdownIcon,
  alias: AliasIcon,
} satisfies Record<Card['kind'], ComponentType<{ size?: number }>>;

const KIND_NAMES = {
  markdown: 'Markdown Card',
  alias: 'Alias',
} satisfies Record<Card['kind'], string>;

export interface CardKindIconProps {
  readonly kind: Card['kind'];
  readonly size?: number;
}

/**
 * The glyph carries the name twice — as an `aria-label` on an `img` role, which
 * is what a screen reader announces, and as a `title`, which is what a pointer
 * hovering it sees. The SVG underneath stays `aria-hidden`, so the two do not
 * both reach the accessibility tree.
 */
export function CardKindIcon({ kind, size }: CardKindIconProps) {
  const Glyph = KIND_GLYPHS[kind];
  return (
    <span
      className="inline-flex flex-none items-center text-[var(--muted-foreground)]"
      role="img"
      aria-label={KIND_NAMES[kind]}
      title={KIND_NAMES[kind]}
      data-card-kind={kind}
    >
      <Glyph {...(size === undefined ? {} : { size })} />
    </span>
  );
}
