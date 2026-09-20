import type { ReactNode } from 'react';
import type { Resource } from '@project/core';
import { ResourceKindIcon } from './ResourceKindIcon';
import { CardHeader } from './components/card';
import { cn } from './lib/utils';
import './resource-rail.css';

export interface ResourceRailProps {
  /** The Resource's kind, drawn as the glyph at the rail's leading edge. */
  readonly kind: Resource['kind'];
  /** The Resource's commands, drawn at the trailing edge. */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly hideKind?: boolean;
  readonly revealed?: boolean;
}

/**
 * The band across the top of a Resource: its kind at the leading edge, its commands
 * at the trailing edge.
 *
 * **It carries no colour of its own** (`.scratch/command-dock/issues/12`). It
 * used to be banded with the Active Graph's, and the commands sat on that band;
 * what sits there now is the neutral command surface the Command Dock wears, so
 * a Resource's commands and the Space's commands read as one language. The Graph's
 * colour stays where it identifies a Graph — the Resource's handles and the Edges
 * each Graph draws — rather than being restated as a wash behind a toolbar.
 *
 * `CanvasResource` draws it on the canvas, where the commands are hidden at rest and
 * revealed with the Resource. Shared geometry lives in `resource-rail.css`; when a Resource
 * reveals its own commands is written in that Resource's stylesheet, because that is
 * the Resource's state rather than the rail's.
 */
export function ResourceRail({
  kind,
  children,
  className,
  hideKind = false,
  revealed,
}: ResourceRailProps) {
  return (
    <CardHeader data-revealed={revealed} className={cn('resource-rail', className)}>
      {!hideKind && (
        <span className="resource-rail__kind">
          <ResourceKindIcon kind={kind} />
        </span>
      )}
      {children}
    </CardHeader>
  );
}
