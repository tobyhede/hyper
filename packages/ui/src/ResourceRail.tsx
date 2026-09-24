import type { ReactNode } from 'react';
import type { Resource } from '@project/core';
import { ResourceKindIcon } from './ResourceKindIcon';
import { CardHeader } from './components/card';
import { cn } from './lib/utils';
import './resource-rail.css';

export interface ResourceRailProps {
  /**
   * The Resource's kind glyph, and its command toolbar when no canvas adapter
   * floats it elsewhere.
   */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The band across the top of a Resource, carrying its kind glyph at the trailing
 * edge.
 *
 * On the canvas the Resource's commands are not drawn here: `ResourceNode` floats
 * them outside the Resource in React Flow's `NodeToolbar`, shown while the Resource
 * is selected and at a constant screen size (ADR 0102). Where no adapter floats
 * the toolbar, it is drawn here, before the glyph.
 *
 * **It carries no colour of its own** (`.scratch/command-dock/issues/12`). The
 * toolbar is the neutral command surface the Command Dock wears, so a Resource's
 * commands and the Space's commands read as one language. The Graph's colour
 * stays where it identifies a Graph — the Resource's handles and the Edges each
 * Graph draws.
 */
export function ResourceRail({ children, className }: ResourceRailProps) {
  return <CardHeader className={cn('resource-rail', className)}>{children}</CardHeader>;
}

export interface ResourceRailKindProps {
  /** The Resource's kind, drawn as a glyph and named by it. */
  readonly kind: Resource['kind'];
}

/**
 * The Resource's kind, drawn at the top-right corner of a Closed Resource. It is
 * the shared `ResourceKindIcon` as it comes, in its own ink.
 */
export function ResourceRailKind({ kind }: ResourceRailKindProps) {
  return (
    <span className="resource-rail__kind">
      <ResourceKindIcon kind={kind} />
    </span>
  );
}
