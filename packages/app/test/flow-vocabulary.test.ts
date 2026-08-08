import { describe, expect, it } from 'vitest';
import { loadSpace } from '@project/graph';
import { DEFAULT_VIEW_ID, defaultRenderer } from '../src/view';

const loaded = loadSpace(
  {
    version: 2,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Example',
    graphs: [],
  },
  [],
);
if (!loaded.ok) throw new Error('expected a valid Space');

describe('Flow Algorithmic View vocabulary', () => {
  it('uses Flow as the default without changing renderer selection behavior', () => {
    expect(DEFAULT_VIEW_ID).toBe('flow');
    expect(defaultRenderer(loaded.space)).toEqual({ kind: 'view', view: 'flow' });
  });
});
