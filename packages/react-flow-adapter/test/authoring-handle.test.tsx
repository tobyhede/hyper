import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Position, ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  AUTHORING_HANDLE_DIAMETER,
  AUTHORING_HANDLE_SIDES,
  AuthoringHandle,
} from '../src/authoring-handle';

describe('AuthoringHandle', () => {
  it('offers four real React Flow controls from one shared geometry contract', () => {
    render(
      <ReactFlowProvider>
        {AUTHORING_HANDLE_SIDES.map((side) => (
          <AuthoringHandle
            key={side}
            side={side}
            role="source"
            color="#ffc53d"
            isConnectableStart={false}
            isConnectableEnd={false}
            onClick={() => undefined}
          />
        ))}
      </ReactFlowProvider>,
    );

    for (const side of [Position.Top, Position.Right, Position.Bottom, Position.Left]) {
      const handle = screen.getByLabelText(`Connect from ${side}`);
      expect(handle).toHaveClass('react-flow__handle', `react-flow__handle-${side}`);
      expect(handle).toHaveStyle({
        width: `${AUTHORING_HANDLE_DIAMETER}px`,
        height: `${AUTHORING_HANDLE_DIAMETER}px`,
        background: '#ffc53d',
      });
    }
  });
});
