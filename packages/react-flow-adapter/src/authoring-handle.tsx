import type { MouseEventHandler } from 'react';
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

export interface AuthoringHandleProps {
  readonly side: AuthoringHandleSide;
  readonly role: AuthoringHandleRole;
  readonly color: string;
  readonly isConnectableStart: boolean;
  readonly isConnectableEnd: boolean;
  readonly onClick: MouseEventHandler<HTMLDivElement>;
}

/**
 * One React Flow control for every Edge handle, including catalogue specimens.
 * Stories provide React Flow's context and disable connection behavior; they do
 * not redraw the control.
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
