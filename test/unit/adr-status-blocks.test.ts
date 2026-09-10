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
 * the scan `.scratch/layout-ownership-review/issues/05-two-refinement-links-point-only-one-way.md`
 * asked for a decision on, and this file is that decision.
 *
 * Two further rules join the reciprocal ones, and both are about where a reader
 * looks rather than about a link. `Status:` takes one word, so a superseded ADR
 * names its superseder on a `Superseded by:` line and nowhere else — the inline
 * `Status: superseded by ADR NNNN` spelling that 0019 and 0029 carried is now a
 * fault. And a superseded ADR lives in `docs/adr/superseded/`, so the directory
 * listing itself is the live set. 54 accepted decisions are too many to read
 * before work; 18 retired ones mixed in among them made it worse.
 *
 * Supersession is asserted reciprocal too, which it could not be until issue
 * `.scratch/layout-ownership-review/issues/04-adr-0040-claims-to-supersede-an-already-superseded-adr.md`
 * settled the convention: one superseder per ADR, with a two-stage retirement
 * read transitively rather than named at both stages. A guard written before
 * that would have decided the question by accident, which is why this half was
 * withheld rather than forgotten.
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
  /** `Superseded by:`. The inline `Status:` spelling is a fault, not a source. */
  readonly supersededBy: readonly string[];
  /** The whole `Status:` value, so a multi-word one can be reported. */
  readonly declaredStatus: string;
  /** Whether the file sits in `docs/adr/superseded/`. */
  readonly retired: boolean;
}

/**
 * Read the leading `Key: value` block. It runs from the H1 to the first blank
 * line after at least one field, which is what every ADR in the tree writes and
 * what keeps a body sentence containing a colon from being read as a field.
 */
const parseStatusBlock = (text: string): Omit<StatusBlock, 'retired'> => {
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

  return {
    fields,
    status: declared.split(/\s+/)[0] ?? '',
    // The `Superseded by:` line and nothing else. The inline spelling used to be
    // folded in here, which made the parser tolerant of two ways to write one
    // fact; `statusSpellingFaults` reports it instead.
    supersededBy: refs(fields.get('Superseded by')),
    declaredStatus: declared,
  };
};

const adrNumber = (file: string): string => file.slice(0, 4);

/** Where an ADR file sits, which the status has to agree with. */
const SUPERSEDED_DIR = 'superseded';

const readDir = (dir: string, retired: boolean): [string, StatusBlock][] =>
  readdirSync(join(adrDir, dir))
    .filter((file) => /^\d{4}-.*\.md$/.test(file))
    .map((file) => [
      adrNumber(file),
      { ...parseStatusBlock(readFileSync(join(adrDir, dir, file), 'utf8')), retired },
    ]);

/**
 * Both directories, as one set.
 *
 * A retired decision is history and stays readable, so the move is a listing
 * change and not a deletion: every reciprocal check below still reaches it, and
 * a live ADR that points at one still resolves.
 */
const readAdrs = (): ReadonlyMap<string, StatusBlock> =>
  new Map([...readDir('.', false), ...readDir(SUPERSEDED_DIR, true)]);

/**
 * A reference naming no ADR is reported rather than skipped. Resolving the
 * target first and *filtering* on it — which is what this did at first — makes
 * the guard silent about the one fault it cannot repair by symmetry: `Refines:
 * 0099` is a dead end for a reader, and an unreachable target is exactly the
 * shape a typo takes.
 *
 * **A rejected ADR is outside the guard as a source**, decided before any of its
 * targets is resolved. Its claims never took effect, so it announces nothing on
 * the ADR it proposed to refine and nobody navigates outward from it — which
 * makes policing its reference list while exempting its reciprocity half a rule.
 *
 * As a *target* it is treated the other way round, and the asymmetry is the
 * point: a `Refines:` naming it asks nothing (there is no live block to answer
 * with), while a `Refined by:` naming it is a fault, because that is a live
 * decision pointing a reader forward at a discarded one.
 *
 * ADR 0016 is the tree's only rejected ADR: the part of it that survived is
 * carried by ADR 0019, which ADR 0010 already names.
 */
const refinesFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] =>
  [...adrs].flatMap(([number, adr]) =>
    adr.status === 'rejected'
      ? []
      : refs(adr.fields.get('Refines')).flatMap((target) => {
          const refined = adrs.get(target);
          if (refined === undefined) return [`${number} Refines ${target}, which is not an ADR`];
          if (refined.status === 'rejected') return [];
          return refs(refined.fields.get('Refined by')).includes(number)
            ? []
            : [`${number} Refines ${target}, but ${target} does not answer`];
        }),
  );

const refinedByFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] =>
  [...adrs].flatMap(([number, adr]) =>
    adr.status === 'rejected'
      ? []
      : refs(adr.fields.get('Refined by')).flatMap((target) => {
          const refiner = adrs.get(target);
          if (refiner === undefined) {
            return [`${number} is 'Refined by' ${target}, which is not an ADR`];
          }
          if (refiner.status === 'rejected') {
            return [`${number} is 'Refined by' ${target}, which is rejected`];
          }
          return refs(refiner.fields.get('Refines')).includes(number)
            ? []
            : [`${number} is 'Refined by' ${target}, but ${target} does not answer`];
        }),
  );

/**
 * The supersession half, in the shape the refinement guards above establish and
 * for the same reasons: a rejected ADR is exempt as a source, a fault as a
 * `Superseded by:` target, and silent as a `Supersedes:` target.
 *
 * One spelling answers: the `Superseded by:` line. 0019 and 0029 reciprocated
 * 0030 inline until `statusSpellingFaults` ruled that out, and both now write
 * the line like everything else.
 */
const supersedesFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] =>
  [...adrs].flatMap(([number, adr]) =>
    adr.status === 'rejected'
      ? []
      : refs(adr.fields.get('Supersedes')).flatMap((target) => {
          const superseded = adrs.get(target);
          if (superseded === undefined) {
            return [`${number} Supersedes ${target}, which is not an ADR`];
          }
          if (superseded.status === 'rejected') return [];
          return superseded.supersededBy.includes(number)
            ? []
            : [`${number} Supersedes ${target}, but ${target} does not answer`];
        }),
  );

/**
 * Reciprocity is not the whole convention, and on its own it does not enforce
 * it. Issue `04` adopted **one** superseder per ADR, and a two-stage retirement
 * written at both ends — 0022 naming 0026 and 0040, each naming 0022 back —
 * satisfies every reciprocal check there is. Cardinality is the assertion that
 * makes the convention hold; without it the shape 0040 was carrying is legal
 * again as soon as someone answers the second link.
 *
 * Counted over *distinct* targets, because `supersededBy` folds the inline
 * spelling in beside the line: an ADR writing both names one superseder twice,
 * which is a redundant record rather than a second retirement.
 */
const supersededByFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] =>
  [...adrs].flatMap(([number, adr]) => {
    if (adr.status === 'rejected') return [];
    const targets = [...new Set(adr.supersededBy)];
    return [
      ...(targets.length > 1
        ? [`${number} is 'Superseded by' ${targets.join(', ')}, but an ADR takes one superseder`]
        : []),
      ...targets.flatMap((target) => {
        const superseder = adrs.get(target);
        if (superseder === undefined) {
          return [`${number} is 'Superseded by' ${target}, which is not an ADR`];
        }
        if (superseder.status === 'rejected') {
          return [`${number} is 'Superseded by' ${target}, which is rejected`];
        }
        return refs(superseder.fields.get('Supersedes')).includes(number)
          ? []
          : [`${number} is 'Superseded by' ${target}, but ${target} does not answer`];
      }),
    ];
  });

/**
 * `Status:` takes one word.
 *
 * 0019 and 0029 wrote `Status: superseded by ADR 0030`, and the parser used to
 * fold that into the same answer as a `Superseded by:` line. Two spellings for
 * one fact cost more than they saved: every reader of the block — this guard,
 * the index generator, a person scanning the directory — had to know both, and
 * the second spelling put a link where nothing else looks for one.
 */
const statusSpellingFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] =>
  [...adrs].flatMap(([number, adr]) =>
    adr.declaredStatus.trim().includes(' ')
      ? [`${number} writes 'Status: ${adr.declaredStatus}'; Status takes one word`]
      : [],
  );

/**
 * A superseded ADR lives in `docs/adr/superseded/`, and nothing else does.
 *
 * The status block already said which decisions were retired, but only to a
 * reader who opened the file. The directory says it to a reader who lists the
 * folder, which is what makes the live set countable.
 */
const locationFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] =>
  [...adrs].flatMap(([number, adr]) => {
    const superseded = adr.status === 'superseded';
    if (superseded && !adr.retired) return [`${number} is superseded but is not in superseded/`];
    if (!superseded && adr.retired) {
      return [`${number} is in superseded/ but its status is '${adr.status}'`];
    }
    return [];
  });

/**
 * The index lists every accepted decision, once.
 *
 * `docs/adr/README.md` exists so a reader can take in the live set without
 * opening 54 files. An index that silently falls behind is worse than none: it
 * reads as complete, so a decision missing from it is a decision nobody knows
 * to look for. This holds the two directions — nothing accepted is absent, and
 * nothing listed has since been retired or was never an ADR.
 *
 * It reads the link targets rather than the prose, so the one-line claims stay
 * free text that a person writes and edits.
 */
const indexFaults = (adrs: ReadonlyMap<string, StatusBlock>): string[] => {
  const index = readFileSync(join(adrDir, 'README.md'), 'utf8');
  // A row's link, e.g. `| [0040](0040-layouts-own-....md) | ... |`.
  const listed = new Set([...index.matchAll(/^\| \[(\d{4})\]\(/gm)].map((row) => row[1] ?? ''));

  const accepted = [...adrs].flatMap(([number, adr]) =>
    adr.status === 'accepted' ? [number] : [],
  );

  return [
    ...accepted.filter((number) => !listed.has(number)).map((n) => `${n} is accepted but unlisted`),
    ...[...listed].flatMap((number) => {
      const adr = adrs.get(number);
      if (adr === undefined) return [`README lists ${number}, which is not an ADR`];
      return adr.status === 'accepted' ? [] : [`README lists ${number}, which is ${adr.status}`];
    }),
  ];
};

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

  it('answers every `Refines` with a `Refined by`, except from a rejected ADR', () => {
    expect(refinesFaults(adrs)).toEqual([]);
  });

  it('answers every `Refined by` with a `Refines`, and never names a rejected ADR', () => {
    expect(refinedByFaults(adrs)).toEqual([]);
  });

  it('answers every `Supersedes` with a `Superseded by`', () => {
    expect(supersedesFaults(adrs)).toEqual([]);
  });

  it('answers every `Superseded by` with a `Supersedes`, and never names a rejected ADR', () => {
    expect(supersededByFaults(adrs)).toEqual([]);
  });

  it('writes a one-word Status on every ADR', () => {
    expect(statusSpellingFaults(adrs)).toEqual([]);
  });

  it('files every superseded ADR under superseded/, and nothing else there', () => {
    expect(locationFaults(adrs)).toEqual([]);
  });

  it('lists every accepted ADR in the index, and nothing else', () => {
    expect(indexFaults(adrs)).toEqual([]);
  });

  it('names a real superseder for every superseded ADR', () => {
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
  /** An ADR set written as status-block fields, parsed the way the tree is. */
  const synthetic = (blocks: Record<string, readonly string[]>): ReadonlyMap<string, StatusBlock> =>
    new Map(
      Object.entries(blocks).map(([number, fields]) => {
        const block = parseStatusBlock(['# A title', '', ...fields].join('\n'));
        // Filed where its own status says it belongs, so a synthetic set never
        // fails the location rule for a reason the case is not about.
        return [number, { ...block, retired: block.status === 'superseded' }];
      }),
    );

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

  it('reads the superseder from the line, and not from an inline Status', () => {
    const inline = parseStatusBlock(['# T', '', 'Status: superseded by ADR 0030'].join('\n'));
    const separate = parseStatusBlock(
      ['# T', '', 'Status: superseded', 'Superseded by: 0030'].join('\n'),
    );

    // The first word still classifies it, so the reciprocity guards keep
    // working on a malformed block rather than skipping it.
    expect(inline.status).toBe('superseded');
    expect(inline.supersededBy).toEqual([]);
    expect(separate.supersededBy).toEqual(['0030']);
  });

  it('reports a multi-word Status', () => {
    const adrs = synthetic({
      '0019': ['Status: superseded by ADR 0030'],
      '0029': ['Status: superseded', 'Superseded by: 0030'],
      '0030': ['Status: accepted', 'Supersedes: 0029'],
    });

    expect(statusSpellingFaults(adrs)).toEqual([
      "0019 writes 'Status: superseded by ADR 0030'; Status takes one word",
    ]);
  });

  it('reports a status and a directory that disagree', () => {
    const filed = new Map([
      ['0022', { ...parseStatusBlock('# T\n\nStatus: superseded'), retired: false }],
      ['0040', { ...parseStatusBlock('# T\n\nStatus: accepted'), retired: true }],
      ['0026', { ...parseStatusBlock('# T\n\nStatus: superseded'), retired: true }],
    ]);

    expect(locationFaults(filed)).toEqual([
      '0022 is superseded but is not in superseded/',
      "0040 is in superseded/ but its status is 'accepted'",
    ]);
  });

  it('reads a literal `none` as naming nothing rather than as an ADR', () => {
    // ADR 0007 writes `Supersedes: none`, and it is the only one that does.
    const block = parseStatusBlock(['# T', '', 'Status: accepted', 'Supersedes: none'].join('\n'));

    expect(refs(block.fields.get('Supersedes'))).toEqual([]);
  });

  it('reports a reference that names no ADR, at either end', () => {
    // Filtering these out is what made the guard silent about a typo, and a
    // dead reference is the one fault symmetry cannot repair.
    const adrs = synthetic({
      '0001': ['Status: accepted', 'Refines: 0099'],
      '0002': ['Status: accepted', 'Refined by: 0098'],
    });

    expect(refinesFaults(adrs)).toEqual(['0001 Refines 0099, which is not an ADR']);
    expect(refinedByFaults(adrs)).toEqual([
      "0002 is 'Refined by' 0098, which is not an ADR",
      // 0002 claims a refiner that does not exist; nothing claims to refine it.
    ]);
  });

  it('reports a live ADR pointing forward at a rejected one', () => {
    const adrs = synthetic({
      '0010': ['Status: accepted', 'Refined by: 0016'],
      '0016': ['Status: rejected', 'Refines: 0010'],
    });

    expect(refinedByFaults(adrs)).toEqual(["0010 is 'Refined by' 0016, which is rejected"]);
  });

  it('asks nothing of a rejected ADR at either end', () => {
    // This is the tree's actual shape: 0016 refines 0010 and 0010 stays silent.
    const adrs = synthetic({
      '0010': ['Status: accepted', 'Refined by: 0019'],
      '0016': ['Status: rejected', 'Refines: 0010', 'Partly carried by: 0019'],
      '0019': ['Status: accepted', 'Refines: 0010'],
    });

    expect(refinesFaults(adrs)).toEqual([]);
    expect(refinedByFaults(adrs)).toEqual([]);
  });

  it('asks nothing of a rejected ADR, even when its own references are broken', () => {
    // The exemption is decided before any target is resolved. A discarded
    // document is not a live navigation path, so a reference nothing follows is
    // not a fault anyone is going to repair — and exempting it from reciprocity
    // while still policing its reference list would be half a rule.
    const adrs = synthetic({
      '0016': ['Status: rejected', 'Refines: 0099', 'Refined by: 0098'],
    });

    expect(refinesFaults(adrs)).toEqual([]);
    expect(refinedByFaults(adrs)).toEqual([]);
  });

  it('reports an ordinary one-way link in both directions', () => {
    const adrs = synthetic({
      '0003': ['Status: accepted'],
      '0007': ['Status: accepted', 'Refines: 0003'],
    });

    expect(refinesFaults(adrs)).toEqual(['0007 Refines 0003, but 0003 does not answer']);

    const answered = synthetic({
      '0003': ['Status: accepted', 'Refined by: 0007'],
      '0007': ['Status: accepted', 'Refines: 0003'],
    });

    expect(refinesFaults(answered)).toEqual([]);
    expect(refinedByFaults(answered)).toEqual([]);
  });

  it('reports a one-way supersession', () => {
    const oneWay = synthetic({
      '0022': ['Status: superseded', 'Superseded by: 0026'],
      '0026': ['Status: accepted'],
    });

    expect(supersededByFaults(oneWay)).toEqual([
      "0022 is 'Superseded by' 0026, but 0026 does not answer",
    ]);
  });

  it('does not accept an inline Status as the answer to a Supersedes', () => {
    // The shape 0019 and 0029 carried. It reciprocated 0030 to a parser that
    // folded the spelling in, and to nothing else — so the link was invisible
    // to every other reader of the block.
    const inline = synthetic({
      '0019': ['Status: superseded by ADR 0030'],
      '0030': ['Status: accepted', 'Supersedes: 0019'],
    });

    expect(supersedesFaults(inline)).toEqual(['0030 Supersedes 0019, but 0019 does not answer']);
  });

  it('reports the two-stage retirement the one-superseder convention rules out', () => {
    // ADR 0040 carried `Supersedes: 0022, 0026` until issue `04` settled on one
    // superseder per ADR. 0022 names 0026 and stops there, so a reader follows
    // the chain rather than finding 0040 named twice — and this is the guard
    // that keeps the convention from drifting back.
    const adrs = synthetic({
      '0022': ['Status: superseded', 'Superseded by: 0026'],
      '0026': ['Status: superseded', 'Supersedes: 0022', 'Superseded by: 0040'],
      '0040': ['Status: accepted', 'Supersedes: 0022, 0026'],
    });

    expect(supersedesFaults(adrs)).toEqual(['0040 Supersedes 0022, but 0022 does not answer']);
  });

  it('reports two superseders even when both directions answer', () => {
    // The convention issue `04` adopted is one superseder per ADR, and
    // reciprocity alone does not enforce it: write the second link at both ends
    // and every `Supersedes` has its `Superseded by` and vice versa. Without a
    // cardinality check the guard would call this record well-formed, and the
    // two-stage shape the convention exists to rule out would return through
    // the one door left open.
    const adrs = synthetic({
      '0022': ['Status: superseded', 'Superseded by: 0026, 0040'],
      '0026': ['Status: superseded', 'Supersedes: 0022', 'Superseded by: 0040'],
      '0040': ['Status: accepted', 'Supersedes: 0022, 0026'],
    });

    expect(supersedesFaults(adrs)).toEqual([]);
    expect(supersededByFaults(adrs)).toEqual([
      "0022 is 'Superseded by' 0026, 0040, but an ADR takes one superseder",
    ]);
  });

  it('counts distinct superseders, so one named twice on the line is not two', () => {
    // The cardinality fault is about a second *superseder*, not a repeated
    // reference to one.
    const adrs = synthetic({
      '0019': ['Status: superseded', 'Superseded by: 0030, 0030'],
      '0030': ['Status: accepted', 'Supersedes: 0019'],
    });

    expect(supersededByFaults(adrs)).toEqual([]);
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
