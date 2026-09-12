import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A ticket number is an address, and an address names one thing.
 *
 * `.scratch` tickets cite each other by number, `AGENTS.md` cites them by
 * number, and a skill handed "issue 16" resolves it by listing the effort's
 * directory. So two files claiming one number inside an effort does not make the
 * tracker untidy — it makes a citation ambiguous to a reader and to an agent
 * following it, with no way to tell which of the two was meant.
 *
 * **This is the same fault `adr-status-blocks.test.ts` found in `docs/adr/`**,
 * and it is asserted the same way for the same reason: a `Map` keyed by the
 * number cannot see it, because a duplicate arrives as a key written twice and
 * the second silently replaces the first. The numbers are read as a list, before
 * anything can collapse them.
 *
 * Scoped to one effort. Numbering restarts at `01` per directory, so `16` in
 * `command-dock` and `16` in `architecture-review` are two different addresses
 * and always were — it is only within an effort that a bare number has to
 * resolve on its own.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const scratchRoot = join(repoRoot, '.scratch');

/** A ticket file: `<NN>-<slug>.md`, numbered from `01`. */
const TICKET = /^(\d+)-.*\.md$/;

/** Every effort with an `issues/` directory, named as `.scratch` names it. */
const efforts = (): readonly string[] =>
  readdirSync(scratchRoot)
    .filter((name) => statSync(join(scratchRoot, name)).isDirectory())
    .filter((name) => {
      try {
        return statSync(join(scratchRoot, name, 'issues')).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

/**
 * Every ticket in one effort, as `[number, file name]` — a list rather than a
 * lookup, which is the whole of what makes the duplicate visible.
 */
const tickets = (effort: string): readonly (readonly [string, string])[] =>
  readdirSync(join(scratchRoot, effort, 'issues'))
    .sort()
    .flatMap((file) => {
      const claimed = TICKET.exec(file);
      return claimed === null ? [] : [[claimed[1]!, file] as const];
    });

/** Every number claimed more than once, named with both files that claim it. */
export const duplicateTicketNumbers = (
  entries: readonly (readonly [string, string])[],
): readonly string[] => {
  const byNumber = new Map<string, string[]>();
  for (const [number, file] of entries)
    byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
  return [...byNumber]
    .filter(([, files]) => files.length > 1)
    .map(([number, files]) => `${number}: ${files.join(', ')}`);
};

describe('a ticket number is claimed once within an effort', () => {
  const found = efforts();

  it('reaches the tracker at all', () => {
    // A listing that quietly stopped resolving would report nothing forever,
    // which is the failure mode of deriving the set rather than writing it down.
    expect(found.length).toBeGreaterThan(20);
    expect(found).toContain('command-dock');
  });

  it.each(found)('%s', (effort) => {
    expect(duplicateTicketNumbers(tickets(effort))).toEqual([]);
  });

  it('reports both files when a number is claimed twice', () => {
    // The guard proved against a planted duplicate rather than asserted: a scan
    // that reported nothing because it read nothing would pass every case above.
    expect(
      duplicateTicketNumbers([
        ['16', '16-first.md'],
        ['16', '16-second.md'],
        ['17', '17-only.md'],
      ]),
    ).toEqual(['16: 16-first.md, 16-second.md']);
  });
});
