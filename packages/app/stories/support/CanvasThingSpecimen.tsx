import { CanvasThing, type CanvasThingFront, type CanvasThingState } from '@project/ui';

interface CanvasThingSpecimenProps {
  readonly title: string;
  readonly kind?: CanvasThingFront['kind'];
  readonly state?: Exclude<CanvasThingState, 'editing'>;
  readonly graphColor?: string;
}

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every front the component declares is reachable from here, each in its
 * resting, closed shape: the three Thing kinds and the creation ghost, which is
 * not a Thing yet and carries neither content nor open state. None of them is
 * handed an authoring callback, so what a specimen draws is the front itself
 * rather than the controls a canvas would hang off it.
 */
export function CanvasThingSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
}: CanvasThingSpecimenProps) {
  const front: CanvasThingFront =
    kind === 'preview'
      ? { kind: 'preview' }
      : kind === 'alias'
        ? { kind: 'alias', source: '', open: false }
        : kind === 'space'
          ? { kind: 'space', open: false }
          : { kind: 'markdown', source: '', open: false };
  return <CanvasThing front={front} title={title} state={state} graphColor={graphColor} />;
}
