import type { CSSProperties, MouseEventHandler } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@project/ui';

/** Diameter of the graph-authoring handles, in canvas pixels. */
export const AUTHORING_HANDLE_DIAMETER = 24;

export const AUTHORING_HANDLE_SIDES = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
] as const;

export type AuthoringHandleSide = (typeof AUTHORING_HANDLE_SIDES)[number];
export type AuthoringHandleRole = 'source' | 'target';

interface AuthoringHandleBaseProps {
  readonly side: AuthoringHandleSide;
  readonly role: AuthoringHandleRole;
  readonly color: string;
}

interface InteractiveAuthoringHandleProps extends AuthoringHandleBaseProps {
  readonly mode: 'interactive';
  readonly isConnectableStart: boolean;
  readonly isConnectableEnd: boolean;
  readonly onClick: MouseEventHandler<HTMLDivElement>;
}

interface SpecimenAuthoringHandleProps extends AuthoringHandleBaseProps {
  readonly mode: 'specimen';
}

export type AuthoringHandleProps = InteractiveAuthoringHandleProps | SpecimenAuthoringHandleProps;

const specimenPosition = (side: AuthoringHandleSide): CSSProperties => {
  switch (side) {
    case Position.Top:
      return { top: 0, left: '50%', transform: 'translate(-50%, -50%)' };
    case Position.Right:
      return { top: '50%', right: 0, transform: 'translate(50%, -50%)' };
    case Position.Bottom:
      return { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' };
    case Position.Left:
      return { top: '50%', left: 0, transform: 'translate(-50%, -50%)' };
  }
};

/**
 * One authoring-handle interface for the live React Flow control and its
 * non-interactive design-system specimen. Geometry, naming and visual classes
 * stay here; callers choose only whether React Flow interaction is present.
 */
export function AuthoringHandle(props: AuthoringHandleProps) {
  const { side, role, color } = props;
  const className = cn(
    'rf-card-node__authoring-handle',
    role === 'source'
      ? 'rf-card-node__authoring-handle--source'
      : 'rf-card-node__authoring-handle--target',
  );
  const style = {
    width: AUTHORING_HANDLE_DIAMETER,
    height: AUTHORING_HANDLE_DIAMETER,
    background: color,
  };

  if (props.mode === 'specimen') {
    return (
      <span
        className={`react-flow__handle ${className}`}
        data-authoring-handle-side={side}
        style={{ position: 'absolute', ...specimenPosition(side), ...style }}
        aria-hidden="true"
      />
    );
  }

  return (
    <Handle
      id={`authoring-${role}-${side}`}
      type={role}
      position={side}
      className={className}
      aria-label={`${role === 'source' ? 'Connect from' : 'Connect to'} ${side}`}
      isConnectableStart={props.isConnectableStart}
      isConnectableEnd={props.isConnectableEnd}
      onClick={props.onClick}
      style={style}
    />
  );
}

/**
 * Diameter of a per-graph overview port, in canvas pixels.
 *
 * Declared once and consumed by both the handle declaration and the rendered
 * element, because the two must agree: React Flow builds `handleBounds` from the
 * declaration, and any forced remeasure rebuilds them from the DOM. If these
 * drift, an Edge attaches off-centre the moment something remeasures.
 */
export const GRAPH_PORT_DIAMETER = 11;
