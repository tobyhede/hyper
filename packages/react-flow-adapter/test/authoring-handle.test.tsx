import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  AUTHORING_HANDLE_DIAMETER,
  AUTHORING_HANDLE_SIDES,
  AuthoringHandle,
} from '../src/authoring-handle';

describe('AuthoringHandle specimen', () => {
  it('offers the four spatial sides from one shared geometry contract', () => {
    const { container } = render(
      <>
        {AUTHORING_HANDLE_SIDES.map((side) => (
          <AuthoringHandle key={side} mode="specimen" side={side} role="source" color="#ffc53d" />
        ))}
      </>,
    );

    const handles = container.querySelectorAll('[data-authoring-handle-side]');
    expect(handles).toHaveLength(4);
    expect([...handles].map((handle) => handle.getAttribute('data-authoring-handle-side'))).toEqual(
      [Position.Top, Position.Right, Position.Bottom, Position.Left],
    );
    for (const handle of handles) {
      expect(handle).toHaveStyle({
        width: `${AUTHORING_HANDLE_DIAMETER}px`,
        height: `${AUTHORING_HANDLE_DIAMETER}px`,
        background: '#ffc53d',
      });
    }
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
