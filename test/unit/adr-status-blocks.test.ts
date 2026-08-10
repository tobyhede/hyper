import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * An ADR's status block is the only navigation `docs/adr/` has — there is no
 * index file to land on instead. A link that points one way is therefore a
 * dead end rather than an untidiness: a reader landing on the refined ADR has
 * no forward pointer to the decision that refined it, and nothing in
 * `pnpm verify` was reading for one. `.prettierignore` excludes every Markdown
 * file so `format:check` never opens an ADR, and a status block is prose to
 * `tsc` and ESLint alike.
 *
 * This reads the blocks themselves, in the idiom `conflict-markers.test.ts`
 * established here for the same shape of problem: one scan over everything,
 * rather than a hand-kept list of the pairs someone remembered to check. It is
 * the scan `.scratch/adr-0040-0042/issues/05-two-refinement-links-point-only-one-way.md`
 * asked for a decision on, and this file is that decision.
 *
 * Supersession is deliberately **not** asserted reciprocal yet. Whether an ADR
 * retired in two stages names one superseder or both is an open convention
 * question (`.scratch/adr-0040-0042/issues/04-...`), and a guard that forced
 * either answer would decide it by accident. The parsing below already reads
 * both supersession spellings so that adding the assertion is a one-line change
 * once that decision lands.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const adrDir = join(repoRoot, 'docs/adr');

/** A status-block field: `Refines: 0003, 0007`. The value may be empty. */
const FIELD = /^([A-Z][A-Za-z ]*): ?(.*)$/;

/** The four-digit ADR numbers in a field value. `Supersedes: none` yields none. */
const refs = (value: string | undefined): readonly string[] => value?.match(/\d{4}/g) ?? [];

interface StatusBlock {
  readonly fields: ReadonlyMap<string, string>;
  /** `accepted`, `rejected` or `superseded`, with the inline spelling folded in. */
  readonly status: string;
  /** `Superseded by:`, plus the superseder named inline in `Status:`. */
  readonly supersededBy: readonly string[];
}

/**
 * Read the leading `Key: value` block. It runs from the H1 to the first blank
 * line after at least one field, which is what every ADR in the tree writes and
 * what keeps a body sentence containing a colon from being read as a field.
 */
const parseStatusBlock = (text: string): StatusBlock => {
  const fields = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') {
      if (fields.size > 0) break;
      continue;
    }
    const field = FIELD.exec(line);
    if (field?.[1] === undefined) {
      if (fields.size > 0) break;
      continue;
    }
    fields.set(field[1], field[2] ?? '');
  }

  const declared = fields.get('Status') ?? '';
  // Two spellings are in the tree and both are legitimate: `Status: superseded`
  // beside a `Superseded by:` line, and `Status: superseded by ADR 0030`
  // inline. A scan that knows only the first reports 0019 and 0029 as gaps when
  // they are not.
  const inline = refs(declared.startsWith('superseded by') ? declared : '');

  return {
    fields,
    status: declared.split(/\s+/)[0] ?? '',
    supersededBy: [...refs(fields.get('Superseded by')), ...inline],
  };
};

const adrNumber = (file: string): string => file.slice(0, 4);

const readAdrs = (): ReadonlyMap<string, StatusBlock> =>
  new Map(
    readdirSync(adrDir)
      .filter((file) => /^\d{4}-.*\.md$/.test(file))
      .map((file) => [adrNumber(file), parseStatusBlock(readFileSync(join(adrDir, file), 'utf8'))]),
  );

describe('ADR status blocks point both ways', () => {
  const adrs = readAdrs();

  it('reaches every ADR in the tree', () => {
    // A directory listing that quietly stopped resolving would report nothing
    // forever, which is the failure mode of deriving the file list rather than
    // writing it down.
    expect(adrs.size).toBeGreaterThan(40);
    expect(adrs.get('0001')).toBeDefined();
    expect([...adrs.values()].every((adr) => adr.status !== '')).toBe(true);
  });

  /**
   * A rejected ADR is exempt as a refiner. Its claims never took effect, so it
   * has nothing to announce on the ADR it proposed to refine, and a forward
   * pointer to it would send a reader from a live decision to a discarded one.
   * ADR 0016 is the tree's only rejected ADR and the only case this reaches:
   * the part of it that survived is carried by ADR 0019, which ADR 0010 already
   * names.
   */
  it('answers every `Refines` with a `Refined by`, except from a rejected ADR', () => {
    const missing = [...adrs].flatMap(([number, adr]) =>
      adr.status === 'rejected'
        ? []
        : refs(adr.fields.get('Refines'))
            .filter((target) => adrs.has(target))
            .filter((target) => !refs(adrs.get(target)?.fields.get('Refined by')).includes(number))
            .map((target) => `${number} Refines ${target}, but ${target} does not answer`),
    );

    expect(missing).toEqual([]);
  });

  it('answers every `Refined by` with a `Refines`', () => {
    const missing = [...adrs].flatMap(([number, adr]) =>
      refs(adr.fields.get('Refined by'))
        .filter((target) => adrs.has(target))
        .filter((target) => !refs(adrs.get(target)?.fields.get('Refines')).includes(number))
        .map((target) => `${number} is 'Refined by' ${target}, but ${target} does not answer`),
    );

    expect(missing).toEqual([]);
  });

  it('names a real superseder for every superseded ADR, in either spelling', () => {
    const unresolved = [...adrs].flatMap(([number, adr]) =>
      adr.status !== 'superseded'
        ? []
        : adr.supersededBy.filter((target) => adrs.has(target)).length > 0
          ? []
          : [`${number} is superseded but names no resolvable superseder`],
    );

    expect(unresolved).toEqual([]);
  });
});

/**
 * The guard above is only as sharp as the parser under it, and a parser that
 * silently stopped reading a field would pass every ADR forever. Read it
 * against the spellings the tree actually contains, and against the lines that
 * only look like fields.
 */
describe('the status block that guard reads', () => {
  it('reads a field block and stops at the body', () => {
    const block = parseStatusBlock(
      ['# A title', '', 'Status: accepted', 'Refines: 0003, 0007', '', 'Body: not a field.'].join(
        '\n',
      ),
    );

    expect(block.status).toBe('accepted');
    expect(refs(block.fields.get('Refines'))).toEqual(['0003', '0007']);
    expect(block.fields.has('Body')).toBe(false);
  });

  it('folds the inline supersession spelling into the same answer as the line', () => {
    const inline = parseStatusBlock(['# T', '', 'Status: superseded by ADR 0030'].join('\n'));
    const separate = parseStatusBlock(
      ['# T', '', 'Status: superseded', 'Superseded by: 0030'].join('\n'),
    );

    expect(inline.status).toBe('superseded');
    expect(inline.supersededBy).toEqual(['0030']);
    expect(separate.supersededBy).toEqual(inline.supersededBy);
  });

  it('reads a literal `none` as naming nothing rather than as an ADR', () => {
    // ADR 0007 writes `Supersedes: none`, and it is the only one that does.
    const block = parseStatusBlock(['# T', '', 'Status: accepted', 'Supersedes: none'].join('\n'));

    expect(refs(block.fields.get('Supersedes'))).toEqual([]);
  });

  it('keeps a one-off relation out of the reciprocal fields it does not belong to', () => {
    // ADR 0016 writes `Partly carried by: 0019`. It is not a refinement and
    // must not be read as one, or 0019 would be reported as owing an answer.
    const block = parseStatusBlock(
      ['# T', '', 'Status: rejected', 'Refines: 0010', 'Partly carried by: 0019'].join('\n'),
    );

    expect(refs(block.fields.get('Refines'))).toEqual(['0010']);
    expect(refs(block.fields.get('Refined by'))).toEqual([]);
    expect(refs(block.fields.get('Partly carried by'))).toEqual(['0019']);
  });
});
