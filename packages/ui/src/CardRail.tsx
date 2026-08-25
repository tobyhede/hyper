import type { CSSProperties, ReactNode } from 'react';
import type { Card } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import { CardHeader } from './components/card';
import './card-rail.css';

/**
 * The one CSS custom property the rail publishes to `card-rail.css`.
 *
 * Declared as the intersection the object is actually built as, rather than
 * asserted into `CSSProperties` after the fact — `CSSProperties` does not type
 * CSS custom properties, and the fact is true by construction (ADR 0062).
 */
type CardRailStyle = CSSProperties & { readonly '--card-rail-graph': string };

export interface CardRailProps {
  /** The Card's kind, drawn as the glyph at the rail's leading edge. */
  readonly kind: Card['kind'];
  /** The Active Graph's colour, which the rail is banded with. */
  readonly graphColor: string;
  /** The Card's actions, drawn at the trailing edge. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The band across the top of a Card: its kind at the leading edge, its actions
 * at the trailing edge, coloured by the Active Graph.
 *
 * One rail, two Cards. `CanvasCard` draws it on the canvas, where it is hidden
 * at rest and revealed with the Card; `OpenCard` draws the same rail on the
 * opened Card, which is that Card expanded and so always shows it. The shared
 * geometry and colour live in `card-rail.css`; a Card that hides its own rail
 * at rest overrides it from its own stylesheet, because that is the Card's
 * state rather than the rail's.
 *
 * The colour arrives as a prop rather than being read from an ambient custom
 * property, so the rail carries its own contract instead of depending on which
 * Card mounted it.
 */
export function CardRail({ kind, graphColor, children, className }: CardRailProps) {
  const style: CardRailStyle = { '--card-rail-graph': graphColor };

  return (
    <CardHeader
      className={className === undefined ? 'card-rail' : `card-rail ${className}`}
      style={style}
    >
      <span className="card-rail__kind">
        <CardKindIcon kind={kind} />
      </span>
      {children}
    </CardHeader>
  );
}
