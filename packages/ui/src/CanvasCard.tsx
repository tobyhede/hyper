import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import type { Card as DomainCard } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import { Card, CardContent, CardHeader, CardTitle } from './components/card';

export type CanvasCardKind = DomainCard['kind'];
export type CanvasCardState =
  'rest' | 'hover' | 'selected' | 'selected-hover' | 'dragging' | 'editing';

export interface CanvasCardProps {
  readonly kind: CanvasCardKind;
  readonly state: CanvasCardState;
  readonly title: string;
  readonly graphColor: string;
  /** The target Card title shown only by an Alias Card. */
  readonly aliasOf?: string;
  readonly titleEditor?: ReactNode;
  readonly actions?: ReactNode;
  readonly onDoubleClickTitle?: MouseEventHandler<HTMLDivElement>;
  readonly titleEditable?: boolean;
}

/**
 * The one visual Card front shared by the production canvas and its stories.
 * Canvas integration stays outside: the adapter translates interaction state
 * and supplies its real controls and handles through dedicated slots.
 */
export function CanvasCard({
  kind,
  state,
  title,
  graphColor,
  aliasOf,
  titleEditor,
  actions,
  onDoubleClickTitle,
  titleEditable = false,
}: CanvasCardProps) {
  return (
    <Card
      role="article"
      aria-label={title}
      className="canvas-card"
      data-testid="card"
      data-kind={kind}
      data-state={state}
      // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`);
      // this value is read only by the Canvas Card stylesheet.
      style={{ '--canvas-card-graph': graphColor } as CSSProperties}
    >
      <CardHeader className="canvas-card__rail">
        <span className="canvas-card__kind">
          <CardKindIcon kind={kind} />
        </span>
        {actions !== undefined && <div className="canvas-card__actions">{actions}</div>}
      </CardHeader>
      <CardContent className="canvas-card__body">
        {titleEditor ?? (
          <CardTitle
            className="canvas-card__title"
            data-editable={titleEditable}
            role="heading"
            aria-level={2}
            onDoubleClick={onDoubleClickTitle}
          >
            {title}
          </CardTitle>
        )}
        {aliasOf !== undefined && (
          <p className="canvas-card__alias-of" data-testid="alias-marker">
            {aliasOf}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
