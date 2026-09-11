import type { CSSProperties, ReactNode } from 'react';
import type { Thing } from '@project/core';
import { ThingKindIcon } from './ThingKindIcon';
import { CardHeader } from './components/card';
import { cn } from './lib/utils';
import './thing-rail.css';

/**
 * The one CSS custom property the rail publishes to `thing-rail.css`.
 *
 * Declared as the intersection the object is actually built as, rather than
 * asserted into `CSSProperties` after the fact — `CSSProperties` does not type
 * CSS custom properties, and the fact is true by construction (ADR 0062).
 */
type ThingRailStyle = CSSProperties & { readonly '--thing-rail-graph': string };

export interface ThingRailProps {
  /** The Thing's kind, drawn as the glyph at the rail's leading edge. */
  readonly kind: Thing['kind'];
  /** The Active Graph's colour, which the rail is banded with. */
  readonly graphColor: string;
  /** The Thing's actions, drawn at the trailing edge. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The band across the top of a Thing: its kind at the leading edge, its actions
 * at the trailing edge, coloured by the Active Graph.
 *
 * `CanvasThing` draws it on the canvas, where it is hidden at rest and revealed
 * with the Thing.
 * Shared geometry and colour live in `thing-rail.css`; a Thing that hides its own
 * rail at rest overrides it from its own stylesheet, because that is the Thing's
 * state rather than the rail's.
 *
 * The colour arrives as a prop rather than being read from an ambient custom
 * property, so the rail carries its own contract instead of depending on which
 * Thing mounted it.
 */
export function ThingRail({ kind, graphColor, children, className }: ThingRailProps) {
  const style: ThingRailStyle = { '--thing-rail-graph': graphColor };

  return (
    <CardHeader className={cn('thing-rail', className)} style={style}>
      <span className="thing-rail__kind">
        <ThingKindIcon kind={kind} />
      </span>
      {children}
    </CardHeader>
  );
}
