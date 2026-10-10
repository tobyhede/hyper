import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * AGENTS.md and `docs/agents/*.md` state build status, and some of it waits on
 * a `.scratch` ticket: a thing is unbuilt "until" a cited ticket lands, it
 * "waits on" a cited ticket, or a cited ticket's work is "being built". Once that ticket's `Status:` says it is
 * resolved, the sentence is false, and nothing but a reader notices. This reads
 * every such citation and fails when the ticket it waits on is resolved.
 *
 * Two scopes, because the claims are written differently. "until" and "waits
 * on" name their ticket in the same sentence. "being built" is a status written in an
 * entry's lead, with the ticket cited later in the same bullet or paragraph.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** The index modes of an ordinary blob; a tracked symlink is `120000`. */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

/** The repository's tracked regular files, the way `docs-agents-citation-accuracy.test.ts` reads them. */
const trackedFiles = (): readonly string[] =>
  execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .flatMap((entry) => {
      const separator = entry.indexOf('\t');
      if (separator === -1) return [];
      return REGULAR_FILE_MODES.has(entry.slice(0, 6)) ? [entry.slice(separator + 1)] : [];
    });

/** The agent docs this guard reads. */
const isAgentDoc = (file: string): boolean =>
  file === 'AGENTS.md' || /^docs\/agents\/[^/]+\.md$/.test(file);

/**
 * A cited ticket, in either form the docs write it: the full file
 * (`.scratch/x/issues/02-slug.md`) or its number alone (`.scratch/x/issues/02`).
 * A spec or a directory carries no `Status:` and is not a ticket.
 */
const TICKET_CITATION = /\.scratch\/([a-z0-9-]+)\/issues\/(\d+)(?:-[a-z0-9-]+)?(?:\.md)?/g;

type Claim = 'until' | 'waits on' | 'being built';

interface TicketCitation {
  readonly doc: string;
  readonly claim: Claim;
  /** The citation as written. */
  readonly cited: string;
  readonly feature: string;
  readonly number: string;
}

/** A bullet, a numbered step, a table row or a paragraph: each starts a new entry. */
const entriesOf = (text: string): readonly string[] =>
  text.split(/\n\s*\n|\n(?=\s*(?:[-*]\s|\d+\.\s|\|))/);

/**
 * Sentences end at `.`, `!` or `?` followed by space and a capital, a backtick,
 * a bracket or bold. A cited path's own dots are never followed by a space.
 */
const sentencesOf = (entry: string): readonly string[] => entry.split(/(?<=[.!?])\s+(?=[A-Z*`([])/);

const ticketsIn = (doc: string, claim: Claim, text: string): readonly TicketCitation[] =>
  [...text.matchAll(TICKET_CITATION)].map((match) => ({
    doc,
    claim,
    cited: match[0],
    feature: match[1] ?? '',
    number: match[2] ?? '',
  }));

/** Every ticket cited by an "until" or "waits on" sentence, or a "being built" entry, of one doc. */
const pendingCitations = (doc: string, text: string): readonly TicketCitation[] =>
  entriesOf(text).flatMap((entry) => [
    ...(/\bbeing built\b/i.test(entry) ? ticketsIn(doc, 'being built', entry) : []),
    ...sentencesOf(entry).flatMap((sentence) => [
      ...(/\buntil\b/i.test(sentence) ? ticketsIn(doc, 'until', sentence) : []),
      ...(/\bwaits on\b/i.test(sentence) ? ticketsIn(doc, 'waits on', sentence) : []),
    ]),
  ]);

/**
 * A ticket's status, in both spellings the tracker uses: bare `Status: resolved`
 * and bold `**Status:** resolved` (`docs/agents/issue-tracker.md`). The colon
 * and the space after it are required, so a line merely beginning with the
 * word is not a status.
 */
const STATUS_LINE = /^\*{0,2}Status:\*{0,2}[ \t]+\**([A-Za-z-]+)/im;

const ticketStatus = (ticket: string): string | null =>
  STATUS_LINE.exec(ticket)?.[1]?.toLowerCase() ?? null;

/** The statuses that say a ticket's work has landed. */
const RESOLVED_STATUSES = new Set(['resolved', 'done']);

/** Reads a cited ticket's text, or answers `null` when no ticket has that number. */
type TicketReader = (citation: TicketCitation) => string | null;

/** Every citation that waits on a ticket which is resolved or does not exist. */
const staleCitationFaults = (
  citations: readonly TicketCitation[],
  readTicket: TicketReader,
): string[] =>
  citations.flatMap((citation) => {
    const where = `${citation.doc} says "${citation.claim}" citing ${citation.cited}`;
    const ticket = readTicket(citation);
    if (ticket === null) return [`${where}, which names no ticket`];
    const status = ticketStatus(ticket);
    return status !== null && RESOLVED_STATUSES.has(status) ? [`${where}, which is ${status}`] : [];
  });

const trackedTicketReader =
  (tracked: readonly string[]): TicketReader =>
  ({ feature, number }) => {
    const prefix = `.scratch/${feature}/issues/${number}-`;
    const file = tracked.find((path) => path.startsWith(prefix) && path.endsWith('.md'));
    return file === undefined ? null : readFileSync(join(repoRoot, file), 'utf8');
  };

describe('an agent doc never waits on a resolved ticket', () => {
  const tracked = trackedFiles();
  const docs = tracked.filter(isAgentDoc);

  it('reads AGENTS.md and the docs/agents guides', () => {
    // A filter that quietly stopped matching would pass every doc forever.
    expect(docs).toContain('AGENTS.md');
    expect(docs).toContain('docs/agents/workflow.md');
  });

  it('cites no resolved ticket beside "until", "waits on" or "being built"', () => {
    const citations = docs.flatMap((doc) =>
      pendingCitations(doc, readFileSync(join(repoRoot, doc), 'utf8')),
    );

    expect(staleCitationFaults(citations, trackedTicketReader(tracked))).toEqual([]);
  });
});

/** The guard above is only as sharp as the reading under it. */
describe('the ticket-status guard', () => {
  const tickets = new Map([
    ['size/02', '# 02: Resize\n\n**Status:** resolved\n'],
    ['seams/01', '# 01: One module\n\nStatus: done\n'],
    ['auto-arrange/01', '# 01: Auto-arrange\n\nStatus: ready-for-agent\n'],
  ]);
  const readFixture: TicketReader = ({ feature, number }) =>
    tickets.get(`${feature}/${number}`) ?? null;

  it('reads both spellings of the status line', () => {
    expect(ticketStatus('**Status:** resolved')).toBe('resolved');
    expect(ticketStatus('Status: resolved')).toBe('resolved');
    expect(ticketStatus('**Status:** ready-for-agent')).toBe('ready-for-agent');
    expect(ticketStatus('Statuses are listed below.')).toBeNull();
  });

  it('fails "until" paired with a resolved ticket', () => {
    const doc =
      '- **ADR 0122 — built, bar the control.** The draft previews one rect; it is offered only on an Open Resource until `.scratch/size/issues/02` offers it on the selected one.';

    expect(staleCitationFaults(pendingCitations('AGENTS.md', doc), readFixture)).toEqual([
      'AGENTS.md says "until" citing .scratch/size/issues/02, which is resolved',
    ]);
  });

  it('fails "being built" paired with a resolved ticket cited later in the entry', () => {
    const doc =
      '- **ADR 0064 — being built.** Open and Close author Open alone. Delivery: `.scratch/seams/issues/01-one-module.md`.';

    expect(staleCitationFaults(pendingCitations('AGENTS.md', doc), readFixture)).toEqual([
      'AGENTS.md says "being built" citing .scratch/seams/issues/01-one-module.md, which is done',
    ]);
  });

  it('fails "waits on" paired with a resolved ticket', () => {
    const doc =
      'The resize control is offered only on an Open Resource. Offering it on the selected one waits on `.scratch/size/issues/02`.';

    expect(staleCitationFaults(pendingCitations('AGENTS.md', doc), readFixture)).toEqual([
      'AGENTS.md says "waits on" citing .scratch/size/issues/02, which is resolved',
    ]);
  });

  it('keeps "waits on" to its own sentence', () => {
    const doc = 'Undo waits on history. The resize control is built (`.scratch/size/issues/02`).';

    expect(pendingCitations('AGENTS.md', doc)).toEqual([]);
  });

  it('passes "until" paired with an open ticket', () => {
    const doc = 'Auto-arrange is not built until `.scratch/auto-arrange/issues/01` lands.';

    expect(staleCitationFaults(pendingCitations('AGENTS.md', doc), readFixture)).toEqual([]);
  });

  it('passes a resolved ticket cited as provenance, with no pending claim', () => {
    const doc = [
      '- The resize control is offered on the selected Resource (`.scratch/size/issues/02`).',
      '',
      'Built until recently, but this sentence cites nothing.',
    ].join('\n');

    expect(pendingCitations('AGENTS.md', doc)).toEqual([]);
  });

  it('keeps "until" to its own table row', () => {
    const doc = [
      '| A1 | Waiting until later | Cost |',
      '| A2 | An engine at render | Survives only in `.scratch/size/issues/02` |',
    ].join('\n');

    expect(pendingCitations('AGENTS.md', doc)).toEqual([]);
  });

  it('keeps "until" to its own sentence', () => {
    const doc =
      'Undo waits until history exists. The resize control is built (`.scratch/size/issues/02`).';

    expect(pendingCitations('AGENTS.md', doc)).toEqual([]);
  });

  it('reports a citation that names no ticket', () => {
    const doc = 'Not built until `.scratch/missing/issues/09` lands.';

    expect(staleCitationFaults(pendingCitations('AGENTS.md', doc), readFixture)).toEqual([
      'AGENTS.md says "until" citing .scratch/missing/issues/09, which names no ticket',
    ]);
  });
});
