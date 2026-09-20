import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeAggregateDirectory } from '../../src/aggregate-directory';
import { benchmarkOptions, benchmarkScenario } from './scenarios';

const { scale, density, openParents } = benchmarkOptions();
const destination = resolve(
  process.env['BENCHMARK_DIRECTORY'] ??
    `.scratch/space-thing-drag-performance/generated/${scale}-${density}-${openParents}`,
);
const scenario = benchmarkScenario(scale, density, openParents);
await mkdir(destination, { recursive: true });
await writeAggregateDirectory(
  {
    metaSpaceId: scenario.aggregate.metaSpaceId,
    spaces: scenario.aggregate.spaces.map((snapshot) => ({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    })),
  },
  destination,
);
console.log(JSON.stringify({ destination, scenario: scenario.name, expected: scenario.expected }));
