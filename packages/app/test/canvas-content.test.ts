import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import type { LayoutStrategyGraph } from '@project/graph';
import { canvasContent } from '../src/canvas-content';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

describe('canvasContent', () => {
  const placed: LayoutStrategyGraph = {
    cards: [{ id: CARD_ID, width: 260, height: 146, ports: [], x: 0, y: 0 }],
    edges: [],
  };

  it('waits for the editor to take a ready placement before drawing it', () => {
    // A resolved placement is not yet Cards on the canvas: `syncProjection`
    // installs it, and drawing before that would hand React Flow a node array
    // the editor store does not own — the one thing a controlled flow must not
    // do, and the reason changes had to be filtered by ownership.
    expect(canvasContent({ kind: 'ready', strategyGraph: placed }, false)).toEqual({
      kind: 'placeholder',
    });
  });

  it('has nothing to draw before a first placement resolves', () => {
    expect(canvasContent({ kind: 'pending' }, false)).toEqual({ kind: 'placeholder' });
  });

  it('keeps drawing the Cards on the canvas while a replacement placement is pending', () => {
    // The Cards on the canvas belong to the editor, which owns their positions
    // outright — they are the current state and not a stale copy of the placement
    // being recomputed. Blanking the canvas here would throw away a live drag.
    expect(canvasContent({ kind: 'pending' }, true)).toEqual({ kind: 'cards' });
  });

  it('reports a failed placement even when Cards are on the canvas', () => {
    const error = new Error('Placement failed');
    expect(canvasContent({ kind: 'failed', error }, true)).toEqual({ kind: 'failure', error });
  });
});
