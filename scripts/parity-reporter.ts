import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import { parityClaims } from '../packages/app/stories/parity-manifest';

interface ParityReporterOptions {
  readonly suite: string;
}

const PREFIX = '@parity:';

export default class ParityReporter implements Reporter {
  readonly #suiteName: string;
  readonly #problems: string[] = [];
  #tagged = new Map<string, TestCase[]>();

  constructor(options: ParityReporterOptions) {
    this.#suiteName = options.suite;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    const expected = new Set(parityClaims.map((claim) => claim.id));
    this.#tagged = new Map([...expected].map((id) => [id, []]));

    for (const test of suite.allTests()) {
      for (const tag of test.tags) {
        if (!tag.startsWith(PREFIX)) continue;
        const id = tag.slice(PREFIX.length);
        const matches = this.#tagged.get(id);
        if (matches === undefined) this.#problems.push(`unknown parity tag ${tag}`);
        else matches.push(test);
      }
    }

    for (const [id, tests] of this.#tagged) {
      if (tests.length !== 1) {
        this.#problems.push(`claim ${id} was collected ${tests.length} times; expected once`);
      }
    }
  }

  onEnd(_result: FullResult): Promise<{ status: 'failed' } | undefined> {
    for (const [id, tests] of this.#tagged) {
      const test = tests[0];
      if (test !== undefined && test.outcome() !== 'expected') {
        this.#problems.push(`claim ${id} finished ${test.outcome()}; expected a non-flaky pass`);
      }
    }

    if (this.#problems.length === 0) return Promise.resolve(undefined);
    console.error(
      `Parity evidence failed in the ${this.#suiteName} suite:\n${this.#problems
        .map((problem) => `- ${problem}`)
        .join('\n')}`,
    );
    return Promise.resolve({ status: 'failed' });
  }
}
