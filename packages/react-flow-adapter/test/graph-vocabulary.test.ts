import { describe, expect, it } from 'vitest';
import * as adapter from '../src/index';

describe('React Flow adapter Graph vocabulary', () => {
  it('exports Graph-qualified composition and rendering names', () => {
    expect(adapter).toHaveProperty('GraphHud');
    expect(adapter).toHaveProperty('GraphConnectionLine');
    expect(adapter).toHaveProperty('projectGraphEdges');
    expect(adapter).not.toHaveProperty('RouteHud');
    expect(adapter).not.toHaveProperty('RouteConnectionLine');
  });
});
