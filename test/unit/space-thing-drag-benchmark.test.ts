import { describe, expect, it } from 'vitest';
import { loadSpaceAggregate } from '@project/graph';
import {
  BENCHMARK_SCALES,
  benchmarkScenario,
} from '../../scripts/space-thing-drag-benchmark/scenarios';

describe('Space Thing drag benchmark scenarios', () => {
  it.each(BENCHMARK_SCALES)('passes aggregate intake at scale %i', (scale) => {
    for (const density of ['sparse', 'dense'] as const) {
      for (const openParents of [1, 3] as const) {
        const scenario = benchmarkScenario(scale, density, openParents);
        const loaded = loadSpaceAggregate({
          snapshots: scenario.aggregate.spaces,
          metaSpaceId: scenario.aggregate.metaSpaceId,
        });
        expect(loaded, scenario.name).toMatchObject({ ok: true });
        expect(scenario.expected.visibleThings).toBe(1 + openParents * (scale + 3));
        expect(scenario.expected.mountedThings).toBe(scenario.expected.visibleThings + scale + 3);
      }
    }
  });
});
