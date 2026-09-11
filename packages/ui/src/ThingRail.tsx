import type { ReactNode } from 'react';
import type { Thing } from '@project/core';
import { ThingKindIcon } from './ThingKindIcon';
import { CardHeader } from './components/card';
import { cn } from './lib/utils';
import './thing-rail.css';

export interface ThingRailProps {
  /** The Thing's kind, drawn as the glyph at the rail's leading edge. */
  readonly kind: Thing['kind'];
  /** The Thing's commands, drawn at the trailing edge. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The band across the top of a Thing: its kind at the leading edge, its commands
 * at the trailing edge.
 *
 * **It carries no colour of its own** (`.scratch/command-dock/issues/12`). It
 * used to be banded with the Active Graph's, and the commands sat on that band;
 * what sits there now is the neutral command surface the Command Dock wears, so
 * a Thing's commands and the Space's commands read as one language. The Graph's
 * colour stays where it identifies a Graph — the Thing's handles and the Edges
 * each Graph draws — rather than being restated as a wash behind a toolbar.
 *
 * `CanvasThing` draws it on the canvas, where the commands are hidden at rest and
 * revealed with the Thing. Shared geometry lives in `thing-rail.css`; when a Thing
 * reveals its own commands is written in that Thing's stylesheet, because that is
 * the Thing's state rather than the rail's.
 */
export function ThingRail({ kind, children, className }: ThingRailProps) {
  return (
    <CardHeader className={cn('thing-rail', className)}>
      <span className="thing-rail__kind">
        <ThingKindIcon kind={kind} />
      </span>
      {children}
    </CardHeader>
  );
}
