import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RunCommand } from '../../src/cli/arguments';
import { decodeRunCommand, encodeRunCommand } from '../../src/cli/run-launcher';
import { describeRunRefusal } from '../../src/cli/run-process';

describe('a run refusal', () => {
  it('names init, with the directory as one shell word, for a missing or empty directory', () => {
    expect(describeRunRefusal({ kind: 'empty' }, '/talks/rust asycn')).toBe(
      "/talks/rust asycn holds no aggregate: it is missing or empty. To create one there: pnpm hyper init '/talks/rust asycn'\n",
    );
  });

  it('lists what made the directory unreadable', () => {
    expect(
      describeRunRefusal({ kind: 'unreadable', diagnostics: ['first', 'second'] }, '/talk'),
    ).toBe('/talk is not an Aggregate directory:\nfirst\nsecond\n');
  });

  it('lists what aggregate intake refused', () => {
    expect(
      describeRunRefusal({ kind: 'aggregate-refused', diagnostics: ['refused'] }, '/talk'),
    ).toBe('Aggregate validation failed:\nrefused\n');
  });
});

describe('the command the launcher hands the run process', () => {
  it('decodes to the command it was encoded from', () => {
    fc.assert(
      fc.property(
        fc.record({
          directory: fc.string({ minLength: 1 }),
          port: fc.option(fc.integer({ min: 1, max: 65_535 }), { nil: undefined }),
          open: fc.boolean(),
        }),
        (fields) => {
          const command: RunCommand = { verb: 'run', ...fields };
          expect(decodeRunCommand(encodeRunCommand(command))).toEqual(command);
        },
      ),
    );
  });

  it.each([
    [[]],
    [['/talk', '']],
    [['/talk', '', 'open', 'extra']],
    [['/talk', '41.5', 'open']],
    [['/talk', '-1', 'open']],
    [['/talk', '', 'yes']],
  ])('refuses %j', (args) => {
    expect(decodeRunCommand(args)).toBeUndefined();
  });
});
