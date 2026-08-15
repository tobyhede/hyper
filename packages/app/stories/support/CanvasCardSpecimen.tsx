import { CanvasCard, type CanvasCardProps } from '@project/ui';

type CanvasCardSpecimenProps = Pick<CanvasCardProps, 'title'> &
  Partial<Pick<CanvasCardProps, 'kind' | 'state' | 'graphColor'>>;

/** Story fixture that composes the shipped visual primitive without redrawing it. */
export function CanvasCardSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
}: CanvasCardSpecimenProps) {
  return <CanvasCard title={title} kind={kind} state={state} graphColor={graphColor} />;
}
