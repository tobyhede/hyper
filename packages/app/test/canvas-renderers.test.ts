import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace } from '@project/graph';
import { canvasRenderers, currentRenderer } from '../src/canvas-renderers';
import { RendererInvariantError } from '../src/renderer';
import { cardFile } from './card-files';

const CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const FIRST = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const SECOND = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MISSING = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const layout = (id: string, title: string, graph: string) => ({
  id,
  title,
  kind: 'positioned' as const,
  positions: { [CARD]: { x: 0, y: 0, open: false } },
  graphs: [{ id: graph, title: `${title} graph`, edges: [] }],
});
const loaded = loadSpace(
  {
    version: 1,
    id: '00000000-0000-4000-8000-000000000040',
    title: 'Choices',
    defaultLayout: FIRST,
    layouts: [
      layout(FIRST, 'Collection 1', '00000000-0000-4000-8000-000000000030'),
      layout(SECOND, 'Collection 2', '00000000-0000-4000-8000-000000000031'),
    ],
  },
  [cardFile(CARD)],
);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));

describe('canvasRenderers', () => {
  it('offers only authored Layouts in declaration order', () => {
    expect(canvasRenderers(loaded.space)).toEqual([
      { selection: FIRST, title: 'Collection 1' },
      { selection: SECOND, title: 'Collection 2' },
    ]);
  });

  it('returns the offered row and refuses an absent Layout', () => {
    const renderers = canvasRenderers(loaded.space);
    expect(currentRenderer(renderers, SECOND)).toBe(renderers[1]);
    expect(() => currentRenderer(renderers, MISSING)).toThrow(RendererInvariantError);
  });
});
