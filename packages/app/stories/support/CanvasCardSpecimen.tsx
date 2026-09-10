import { CanvasCard, type CanvasCardFront, type CanvasCardState } from '@project/ui';

interface CanvasCardSpecimenProps {
  readonly title: string;
  readonly kind?: CanvasCardFront['kind'];
  readonly state?: Exclude<CanvasCardState, 'editing'>;
  readonly graphColor?: string;
}

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every front the component declares is reachable from here, each in its
 * resting, closed shape: the three Card kinds and the creation ghost, which is
 * not a Card yet and carries neither content nor open state. None of them is
 * handed an authoring callback, so what a specimen draws is the front itself
 * rather than the controls a canvas would hang off it.
 */
export function CanvasCardSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
}: CanvasCardSpecimenProps) {
  const front: CanvasCardFront =
    kind === 'preview'
      ? { kind: 'preview' }
      : kind === 'alias'
        ? { kind: 'alias', source: '', open: false }
        : kind === 'space'
          ? { kind: 'space', open: false }
          : { kind: 'markdown', source: '', open: false };
  return <CanvasCard front={front} title={title} state={state} graphColor={graphColor} />;
}
