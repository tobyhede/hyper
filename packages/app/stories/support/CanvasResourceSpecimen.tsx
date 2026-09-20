import { CanvasResource, type CanvasResourceFront, type CanvasResourceState } from '@project/ui';

interface CanvasResourceSpecimenProps {
  readonly title: string;
  readonly kind?: CanvasResourceFront['kind'];
  readonly state?: Exclude<CanvasResourceState, 'editing'>;
  readonly graphColor?: string;
}

/**
 * Story fixture that composes the shipped visual primitive without redrawing it.
 *
 * Every front the component declares is reachable from here, each in its
 * resting, closed shape: the three Resource kinds and the creation ghost, which is
 * not a Resource yet and carries neither content nor open state. None of them is
 * handed an authoring callback, so what a specimen draws is the front itself
 * rather than the controls a canvas would hang off it.
 */
export function CanvasResourceSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
}: CanvasResourceSpecimenProps) {
  const front: CanvasResourceFront =
    kind === 'preview'
      ? { kind: 'preview' }
      : kind === 'reference'
        ? { kind: 'reference', target: { kind: 'markdown', source: '' }, open: false }
        : kind === 'space'
          ? { kind: 'space', open: false }
          : { kind: 'markdown', source: '', open: false };
  return <CanvasResource front={front} title={title} state={state} graphColor={graphColor} />;
}
