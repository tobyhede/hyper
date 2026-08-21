import { CanvasCard, type CanvasCardFront, type CanvasCardState } from '@project/ui';

interface CanvasCardSpecimenProps {
  readonly title: string;
  readonly kind?: CanvasCardFront['kind'];
  readonly aliasOf?: string;
  readonly state?: Exclude<CanvasCardState, 'editing'>;
  readonly graphColor?: string;
}

/** Story fixture that composes the shipped visual primitive without redrawing it. */
export function CanvasCardSpecimen({
  title,
  kind = 'markdown',
  aliasOf = 'Opening',
  state = 'rest',
  graphColor = '#ffc53d',
}: CanvasCardSpecimenProps) {
  const front: CanvasCardFront =
    kind === 'alias' ? { kind: 'alias', aliasOf } : { kind: 'markdown' };
  return <CanvasCard front={front} title={title} state={state} graphColor={graphColor} />;
}
