import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import type { Card as DomainCard } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import { EditIcon } from './icons';
import { Card, CardContent, CardHeader, CardTitle } from './components/card';
import './canvas-card.css';

export type CanvasCardKind = DomainCard['kind'];
export type CanvasCardState =
  'rest' | 'hover' | 'selected' | 'selected-hover' | 'dragging' | 'editing';

export interface CanvasCardProps {
  readonly kind: CanvasCardKind;
  readonly state: CanvasCardState;
  readonly title: string;
  readonly graphColor: string;
  readonly description?: string;
  /** The target Card's title, present only when this Card is an Alias. */
  readonly aliasOf?: string;
  readonly titleEditor?: ReactNode;
  readonly actions?: ReactNode;
  /** Real interaction handles supplied by the canvas adapter. */
  readonly handles?: ReactNode;
  readonly onDoubleClickTitle?: MouseEventHandler<HTMLDivElement>;
  readonly titleEditable?: boolean;
}

/**
 * The one visual Front shared by canvas Cards and their design-system stories.
 * Canvas integration stays outside: adapters translate interaction state and
 * supply their own real handles through the dedicated slot.
 */
export function CanvasCard({
  kind,
  state,
  title,
  graphColor,
  description,
  aliasOf,
  titleEditor,
  actions,
  handles,
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
      style={{ '--canvas-card-graph': graphColor } as CSSProperties}
    >
      <CardHeader className="canvas-card__rail">
        <span className="canvas-card__kind">
          {state === 'editing' ? <EditIcon /> : <CardKindIcon kind={kind} />}
        </span>
        {actions !== undefined && <div className="canvas-card__actions">{actions}</div>}
        {state === 'editing' && <span className="canvas-card__editing-hint">⏎ · esc</span>}
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
        {description !== undefined && (
          <p className="canvas-card__description" data-testid="card-description">
            {description}
          </p>
        )}
        {aliasOf !== undefined && (
          <p className="canvas-card__alias-of" data-testid="alias-marker">
            {aliasOf}
          </p>
        )}
      </CardContent>
      {handles}
    </Card>
  );
}
