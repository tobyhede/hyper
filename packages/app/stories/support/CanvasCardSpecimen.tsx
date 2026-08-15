import { CanvasCard, ConnectIcon, EditIcon, type CanvasCardProps } from '@project/ui';
import {
  AUTHORING_HANDLE_SIDES,
  AuthoringHandle,
} from '@project/react-flow-adapter/authoring-handle';

type CanvasCardSpecimenProps = Pick<CanvasCardProps, 'title'> &
  Partial<Pick<CanvasCardProps, 'kind' | 'state' | 'graphColor'>> & {
    readonly showActions?: boolean;
    readonly showHandles?: boolean;
  };

/** Story fixture that composes the shipped visual primitive without redrawing it. */
export function CanvasCardSpecimen({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
  showActions = false,
  showHandles = false,
}: CanvasCardSpecimenProps) {
  return (
    <CanvasCard
      title={title}
      kind={kind}
      state={state}
      graphColor={graphColor}
      {...(state === 'editing'
        ? {
            titleEditor: (
              <div className="card__title-editor">
                <input
                  className="card__title-input"
                  aria-label="Card title"
                  value={title}
                  readOnly
                />
              </div>
            ),
          }
        : {})}
      actions={
        showActions ? (
          <>
            <button type="button" className="card__connect" aria-label={`Connect from ${title}`}>
              <ConnectIcon />
            </button>
            <button type="button" className="card__edit" aria-label={`Edit Card ${title}`}>
              <EditIcon />
            </button>
          </>
        ) : undefined
      }
      handles={
        showHandles
          ? AUTHORING_HANDLE_SIDES.map((side) => (
              <AuthoringHandle
                key={side}
                mode="specimen"
                side={side}
                role="source"
                color={graphColor}
              />
            ))
          : undefined
      }
    />
  );
}
