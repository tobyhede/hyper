import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Rolls `.scratch/` up into one "where are we" view.
 *
 * The tracker is one directory per effort with one file per ticket, so no single
 * file answers "what is in flight". This derives that answer from the `Status:`
 * and `Blocked by:` lines the tickets already carry, rather than asking anyone to
 * maintain a roadmap document alongside them.
 */

export type IssueState =
  | 'done'
  | 'dropped'
  | 'accepted'
  | 'claimed'
  | 'ready-for-agent'
  | 'ready-for-human'
  | 'needs-triage'
  | 'needs-info'
  | 'unrecognised';

export type FeaturePhase = 'complete' | 'in-flight' | 'open' | 'no-issues';

export interface BlockerReference {
  /** The feature slug a cross-effort reference names, or null when same-feature. */
  readonly feature: string | null;
  readonly number: string;
}

export interface ScratchIssue {
  /** Path relative to the scratch root, e.g. `design-system-baseline/issues/05-....md`. */
  readonly path: string;
  readonly number: string | null;
  readonly title: string;
  readonly state: IssueState;
  /** The status line's own words, first line only, trimmed of markdown emphasis. */
  readonly status: string;
  readonly blockers: readonly BlockerReference[];
  /** Blockers that are not settled yet, rendered for a human. */
  readonly unmetBlockers: readonly string[];
  /** Lines in a settled issue that read as work left behind. */
  readonly deferrals: readonly string[];
}

export interface FeatureRoadmap {
  readonly slug: string;
  readonly phase: FeaturePhase;
  readonly settledCount: number;
  readonly issues: readonly ScratchIssue[];
  /** Specs, maps, findings and handoffs — anything with a status that is not a ticket. */
  readonly documents: readonly ScratchIssue[];
}

export interface Roadmap {
  readonly features: readonly FeatureRoadmap[];
  readonly issueCount: number;
  readonly openCount: number;
}

/**
 * Both `Status: resolved` and `**Status:** resolved` are current, and one family
 * bolds the whole line (`**Status: delivered.**`). A scan that misses a spelling
 * reports live efforts as unstatused, so all three are matched here.
 */
const STATUS_PATTERN = /^\*{0,2}status:\*{0,2}[ \t]+(.+)$/iu;
const BLOCKED_PATTERN = /^\*{0,2}blocked by:?\*{0,2}[ \t]*(.*)$/iu;
const HEADING_PATTERN = /^#[ \t]+(.+?)[ \t]*$/u;
const NUMBERED_TITLE_PATTERN = /^\d{2}[ \t]*[—–-][ \t]*/u;
const FILE_NUMBER_PATTERN = /^(\d{2})-/u;
const NO_BLOCKERS_PATTERN = /^(none|nothing|n\/a)\b/iu;
/**
 * A blocked-by line carries prose alongside its references, and that prose cites
 * ADR and PR numbers. Requiring no adjacent digit and no leading `#` keeps `0052`
 * and `#83` out while still reading `03` and `space-authoring/05`.
 */
const REFERENCE_PATTERN = /(?:([a-z][a-z0-9-]*)\/)?(?<![#\d])(\d{2})(?!\d)/giu;
/**
 * Only a declared deferral counts — a heading or a list item that announces one.
 * Prose merely mentioning the word appears throughout resolved tickets and drowns
 * the signal the issue-tracker guidance asks for.
 */
const DEFERRAL_PATTERN = /^\s*(?:#{2,4}\s*|[-*]\s*\*{0,2})(deferred|out of scope|follow-up)/iu;

const STATE_BY_WORD = new Map<string, IssueState>([
  ['resolved', 'done'],
  ['done', 'done'],
  ['delivered', 'done'],
  ['built', 'done'],
  ['shipped', 'done'],
  ['complete', 'done'],
  ['completed', 'done'],
  ['wontfix', 'dropped'],
  ['superseded', 'dropped'],
  ['obsoleted', 'dropped'],
  ['historical', 'dropped'],
  ['accepted', 'accepted'],
  ['claimed', 'claimed'],
  ['ready-for-agent', 'ready-for-agent'],
  ['ready-for-human', 'ready-for-human'],
  ['needs-triage', 'needs-triage'],
  ['needs-info', 'needs-info'],
]);

const SETTLED_STATES = new Set<IssueState>(['done', 'dropped', 'accepted']);

const isSettled = (state: IssueState): boolean => SETTLED_STATES.has(state);

const markdownFilesIn = (directory: string): readonly string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name))
    .sort();
};

const readStatus = (lines: readonly string[]): string | null => {
  for (const line of lines) {
    const matched = STATUS_PATTERN.exec(line);
    if (matched !== null) return (matched[1] ?? '').replace(/\*+$/u, '').trim();
  }
  return null;
};

/** Classify by the first word; everything after it is prose for a human, not a state. */
export const stateOf = (status: string): IssueState => {
  const first =
    status
      .toLowerCase()
      .replace(/^\*+/u, '')
      .split(/[\s—–,.;:(]/u)[0] ?? '';
  return STATE_BY_WORD.get(first) ?? 'unrecognised';
};

const readTitle = (lines: readonly string[], fallback: string): string => {
  for (const line of lines) {
    const matched = HEADING_PATTERN.exec(line);
    if (matched !== null) return (matched[1] ?? '').replace(NUMBERED_TITLE_PATTERN, '');
  }
  return fallback;
};

const readBlockers = (lines: readonly string[]): readonly BlockerReference[] => {
  for (const line of lines) {
    const matched = BLOCKED_PATTERN.exec(line);
    if (matched === null) continue;
    const value = matched[1] ?? '';
    if (NO_BLOCKERS_PATTERN.test(value.trim())) return [];
    const references: BlockerReference[] = [];
    for (const reference of value.matchAll(REFERENCE_PATTERN)) {
      const number = reference[2];
      if (number === undefined) continue;
      references.push({ feature: reference[1] ?? null, number });
    }
    return references;
  }
  return [];
};

const readDeferrals = (lines: readonly string[], state: IssueState): readonly string[] => {
  if (!isSettled(state)) return [];
  return lines
    .filter((line) => DEFERRAL_PATTERN.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^#+\s*/u, '')
        .slice(0, 100),
    );
};

interface ParsedIssue {
  readonly path: string;
  readonly number: string | null;
  readonly title: string;
  readonly state: IssueState;
  readonly status: string;
  readonly blockers: readonly BlockerReference[];
  readonly deferrals: readonly string[];
}

const parseFile = (root: string, file: string): ParsedIssue | null => {
  const lines = readFileSync(file, 'utf8').split('\n');
  const status = readStatus(lines);
  if (status === null) return null;
  const name = basename(file);
  const state = stateOf(status);
  const numbered = FILE_NUMBER_PATTERN.exec(name);
  return {
    path: relative(root, file),
    number: numbered?.[1] ?? null,
    title: readTitle(lines, name.replace(/\.md$/u, '')),
    state,
    status,
    blockers: readBlockers(lines),
    deferrals: readDeferrals(lines, state),
  };
};

const phaseOf = (issues: readonly ParsedIssue[], settled: number): FeaturePhase => {
  if (issues.length === 0) return 'no-issues';
  if (settled === issues.length) return 'complete';
  if (settled === 0) return 'open';
  return 'in-flight';
};

interface ScannedFeature {
  readonly slug: string;
  readonly issues: readonly ParsedIssue[];
  readonly documents: readonly ParsedIssue[];
}

const scanFeature = (root: string, slug: string): ScannedFeature => {
  const directory = join(root, slug);
  const issues = markdownFilesIn(join(directory, 'issues'))
    .map((file) => parseFile(root, file))
    .filter((issue): issue is ParsedIssue => issue !== null);
  const documents = markdownFilesIn(directory)
    .map((file) => parseFile(root, file))
    .filter((document): document is ParsedIssue => document !== null);
  return { slug, issues, documents };
};

const blockerKey = (feature: string, number: string): string => `${feature}/${number}`;

export const buildRoadmap = (root: string): Roadmap => {
  const scratchRoot = resolve(root);
  const slugs = readdirSync(scratchRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const scanned = slugs.map((slug) => scanFeature(scratchRoot, slug));

  const stateByKey = new Map<string, IssueState>();
  for (const feature of scanned) {
    for (const issue of feature.issues) {
      if (issue.number !== null)
        stateByKey.set(blockerKey(feature.slug, issue.number), issue.state);
    }
  }

  const features = scanned.map((feature): FeatureRoadmap => {
    const issues = feature.issues.map((issue): ScratchIssue => {
      const unmet = isSettled(issue.state)
        ? []
        : issue.blockers
            .map((blocker) => blockerKey(blocker.feature ?? feature.slug, blocker.number))
            .filter((key) => {
              const state = stateByKey.get(key);
              return state === undefined || !isSettled(state);
            });
      return { ...issue, unmetBlockers: unmet };
    });
    const settledCount = issues.filter((issue) => isSettled(issue.state)).length;
    return {
      slug: feature.slug,
      phase: phaseOf(feature.issues, settledCount),
      settledCount,
      issues,
      documents: feature.documents.map((document) => ({ ...document, unmetBlockers: [] })),
    };
  });

  const issueCount = features.reduce((total, feature) => total + feature.issues.length, 0);
  const openCount = features.reduce(
    (total, feature) => total + feature.issues.filter((issue) => !isSettled(issue.state)).length,
    0,
  );
  return { features, issueCount, openCount };
};

/**
 * `ROADMAP.md` holds the one thing a scan cannot answer: which effort is next and
 * why. Reading it here keeps that intent in front of whoever runs the tool, rather
 * than in a file that has to be remembered.
 */
export const readIntent = (root: string): string | null => {
  const file = join(root, 'ROADMAP.md');
  return existsSync(file) ? readFileSync(file, 'utf8').trimEnd() : null;
};

const byPhase = (roadmap: Roadmap, phase: FeaturePhase): readonly FeatureRoadmap[] =>
  roadmap.features.filter((feature) => feature.phase === phase);

const openIssues = (feature: FeatureRoadmap): readonly ScratchIssue[] =>
  feature.issues.filter((issue) => !isSettled(issue.state));

const issueLine = (issue: ScratchIssue): string => {
  const number = issue.number ?? '--';
  const blocked =
    issue.unmetBlockers.length > 0 ? `  blocked by ${issue.unmetBlockers.join(', ')}` : '';
  return `    ${number}  ${issue.state.padEnd(15)} ${issue.title}${blocked}`;
};

const featureBlock = (feature: FeatureRoadmap): readonly string[] => [
  `  ${feature.slug.padEnd(40)} ${feature.settledCount}/${feature.issues.length} settled`,
  ...openIssues(feature).map(issueLine),
];

const wrapSlugs = (features: readonly FeatureRoadmap[]): readonly string[] => {
  const names = features.map((feature) => `${feature.slug} (${feature.issues.length})`);
  const lines: string[] = [];
  let current = '';
  for (const name of names) {
    const next = current === '' ? name : `${current} · ${name}`;
    if (next.length > 92) {
      lines.push(`  ${current}`);
      current = name;
    } else current = next;
  }
  if (current !== '') lines.push(`  ${current}`);
  return lines;
};

export const renderRoadmap = (roadmap: Roadmap, intent: string | null = null): string => {
  const inFlight = [...byPhase(roadmap, 'in-flight')].sort(
    (left, right) => openIssues(left).length - openIssues(right).length,
  );
  const open = byPhase(roadmap, 'open');
  const complete = byPhase(roadmap, 'complete');
  const untracked = byPhase(roadmap, 'no-issues');
  const grabbable = roadmap.features.flatMap((feature) =>
    openIssues(feature)
      .filter((issue) => issue.unmetBlockers.length === 0 && issue.state !== 'claimed')
      .map((issue) => `  ${feature.slug}/${issue.number ?? '--'}  ${issue.title}`),
  );
  const deferred = roadmap.features.flatMap((feature) =>
    feature.issues
      .filter((issue) => issue.deferrals.length > 0)
      .map(
        (issue) => `  ${issue.path}\n${issue.deferrals.map((line) => `      ${line}`).join('\n')}`,
      ),
  );
  const unrecognised = roadmap.features.flatMap((feature) =>
    [...feature.issues, ...feature.documents]
      .filter((issue) => issue.state === 'unrecognised')
      .map((issue) => `  ${issue.path}  →  ${issue.status}`),
  );

  const lines: string[] = [
    `.scratch — ${roadmap.features.length} efforts · ${roadmap.issueCount} issues · ${roadmap.openCount} open`,
    ...(intent === null ? [] : ['', intent, '']),
    '',
    `IN FLIGHT — ${inFlight.length}`,
    ...inFlight.flatMap(featureBlock),
  ];
  if (open.length > 0) {
    lines.push('', `NOT STARTED — ${open.length}`, ...open.flatMap(featureBlock));
  }
  if (grabbable.length > 0) {
    lines.push('', `READY TO PICK UP — ${grabbable.length} (no unmet blockers)`, ...grabbable);
  }
  if (deferred.length > 0) {
    lines.push('', `DEFERRED WORK INSIDE SETTLED ISSUES — ${deferred.length}`, ...deferred);
  }
  if (unrecognised.length > 0) {
    lines.push('', `UNRECOGNISED STATUS — ${unrecognised.length}`, ...unrecognised);
  }
  lines.push('', `COMPLETE — ${complete.length}`, ...wrapSlugs(complete));
  lines.push(
    '',
    `NO ISSUES — ${untracked.length} (spec, research or notes only)`,
    ...wrapSlugs(untracked),
  );
  return lines.join('\n');
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

/** Ticket titles and deferral notes carry inline code spans; keep them readable. */
const inlineMarkup = (text: string): string =>
  escapeHtml(text).replace(/`([^`]+)`/gu, '<code>$1</code>');

/**
 * `ROADMAP.md` is authored here, so this handles the subset it uses — headings,
 * bullets with wrapped continuation lines, and inline code. Anything else lands
 * as a paragraph, which is the honest degradation for a hand-written file.
 */
const intentHtml = (markdown: string): string => {
  const html: string[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  const closeList = (): void => {
    if (list.length > 0) html.push(`<ul>${list.join('')}</ul>`);
    list = [];
  };
  const closeParagraph = (): void => {
    if (paragraph.length > 0) html.push(`<p>${paragraph.join(' ')}</p>`);
    paragraph = [];
  };
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('# ')) {
      closeParagraph();
      closeList();
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeParagraph();
      closeList();
      html.push(`<h3>${inlineMarkup(trimmed.slice(3))}</h3>`);
    } else if (trimmed.startsWith('- ')) {
      closeParagraph();
      list.push(`<li>${inlineMarkup(trimmed.slice(2))}</li>`);
    } else if (list.length > 0) {
      const open = list.pop() ?? '';
      list.push(open.replace(/<\/li>$/u, ` ${inlineMarkup(trimmed)}</li>`));
    } else paragraph.push(inlineMarkup(trimmed));
  }
  closeParagraph();
  closeList();
  return html.join('');
};

const htmlIssue = (issue: ScratchIssue): string => {
  const blocked =
    issue.unmetBlockers.length > 0
      ? `<span class="blocked">blocked by ${issue.unmetBlockers.map((key) => escapeHtml(key)).join(', ')}</span>`
      : '';
  return [
    '<li class="issue">',
    `<span class="num">${escapeHtml(issue.number ?? '--')}</span>`,
    `<span class="badge ${issue.state}">${issue.state}</span>`,
    `<a class="title" href="${escapeHtml(issue.path)}">${inlineMarkup(issue.title)}</a>`,
    blocked,
    '</li>',
  ].join('');
};

const htmlFeature = (feature: FeatureRoadmap): string => {
  const total = feature.issues.length;
  const percent = total === 0 ? 0 : Math.round((feature.settledCount / total) * 100);
  return [
    '<article class="feature">',
    '<header>',
    `<h3>${escapeHtml(feature.slug)}</h3>`,
    `<span class="count">${feature.settledCount}/${total} settled</span>`,
    `<div class="bar"><div class="fill" style="width:${percent}%"></div></div>`,
    '</header>',
    `<ul>${openIssues(feature).map(htmlIssue).join('')}</ul>`,
    '</article>',
  ].join('');
};

const htmlChips = (features: readonly FeatureRoadmap[]): string =>
  features
    .map(
      (feature) =>
        `<span class="chip">${escapeHtml(feature.slug)}<em>${feature.issues.length}</em></span>`,
    )
    .join('');

const htmlSection = (title: string, count: number, body: string): string =>
  body === ''
    ? ''
    : `<section><h2>${escapeHtml(title)}<span class="tally">${count}</span></h2>${body}</section>`;

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #fbfbfa; --panel: #ffffff; --line: #e4e2dd; --ink: #23211d; --muted: #7c766c;
  --accent: #2f6f4f; --warn: #9a6212; --stop: #a33a2a; --cool: #2f5d8f; --claim: #6b4c9a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171614; --panel: #1f1e1b; --line: #322f2a; --ink: #ecebe7; --muted: #948d81;
    --accent: #7fc39c; --warn: #e0aa63; --stop: #e8897a; --cool: #86b4e6; --claim: #b9a0e0;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2.5rem 1.5rem 5rem; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
}
main { max-width: 60rem; margin: 0 auto; }
h1 { font-size: 1.35rem; margin: 0 0 .25rem; letter-spacing: -.01em; }
.summary { color: var(--muted); margin: 0 0 2.5rem; font-variant-numeric: tabular-nums; }
h2 {
  font-size: .78rem; text-transform: uppercase; letter-spacing: .09em; color: var(--muted);
  margin: 2.5rem 0 .9rem; display: flex; align-items: center; gap: .6rem;
}
.tally {
  background: var(--panel); border: 1px solid var(--line); border-radius: 999px;
  padding: .05rem .5rem; font-size: .72rem; letter-spacing: 0;
}
.feature {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: .9rem 1.1rem; margin-bottom: .7rem;
}
.feature header { display: flex; align-items: center; gap: .8rem; }
.feature h3 { font-size: .95rem; margin: 0; font-family: ui-monospace, SFMono-Regular, monospace; }
.count { color: var(--muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
.bar { flex: 1; height: 4px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); }
.feature ul { list-style: none; margin: .75rem 0 0; padding: 0; }
.issue {
  display: flex; align-items: baseline; gap: .55rem; flex-wrap: wrap;
  padding: .3rem 0; border-top: 1px solid var(--line);
}
.num { font-family: ui-monospace, monospace; color: var(--muted); font-size: .8rem; }
.badge {
  font-size: .68rem; letter-spacing: .04em; text-transform: uppercase; border-radius: 4px;
  padding: .1rem .4rem; border: 1px solid currentColor; white-space: nowrap;
}
.badge.ready-for-agent { color: var(--accent); }
.badge.ready-for-human { color: var(--warn); }
.badge.needs-triage, .badge.needs-info { color: var(--cool); }
.badge.claimed { color: var(--claim); }
.badge.unrecognised { color: var(--stop); }
.title { flex: 1; min-width: 14rem; color: inherit; text-decoration: none; }
.title:hover, .pick a:hover { text-decoration: underline; }
.blocked { font-size: .76rem; color: var(--stop); }
code {
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: .87em;
  background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 0 .25em;
}
.pick { list-style: none; margin: 0; padding: 0; }
.pick li { padding: .35rem 0; border-bottom: 1px solid var(--line); }
.pick a { color: inherit; text-decoration: none; }
.pick .ref { font-family: ui-monospace, monospace; color: var(--muted); margin-right: .6rem; }
details { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); padding: .7rem 1.1rem; }
summary { cursor: pointer; color: var(--muted); font-size: .85rem; }
details ul { list-style: none; padding: 0; margin: .8rem 0 0; }
details li { padding: .45rem 0; border-top: 1px solid var(--line); }
details .path { font-family: ui-monospace, monospace; font-size: .78rem; color: var(--muted); display: block; }
.chip {
  display: inline-flex; align-items: baseline; gap: .35rem; background: var(--panel);
  border: 1px solid var(--line); border-radius: 999px; padding: .15rem .6rem;
  margin: 0 .3rem .4rem 0; font-size: .8rem; font-family: ui-monospace, monospace;
}
.chip em { font-style: normal; color: var(--muted); font-size: .72rem; }
.intent {
  background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent);
  border-radius: 10px; padding: .4rem 1.2rem 1.1rem;
}
.intent h3 { font-size: .95rem; margin: 1.2rem 0 .4rem; }
.intent p { margin: .5rem 0; color: var(--ink); }
.intent ul { margin: .5rem 0 0; padding-left: 1.1rem; }
.intent li { margin: .3rem 0; }
`;

export const renderRoadmapHtml = (roadmap: Roadmap, intent: string | null = null): string => {
  const inFlight = [...byPhase(roadmap, 'in-flight')].sort(
    (left, right) => openIssues(left).length - openIssues(right).length,
  );
  const grabbable = roadmap.features.flatMap((feature) =>
    openIssues(feature)
      .filter((issue) => issue.unmetBlockers.length === 0 && issue.state !== 'claimed')
      .map(
        (issue) =>
          `<li><a href="${escapeHtml(issue.path)}"><span class="ref">${escapeHtml(feature.slug)}/${escapeHtml(issue.number ?? '--')}</span>${inlineMarkup(issue.title)}</a></li>`,
      ),
  );
  const deferred = roadmap.features.flatMap((feature) =>
    feature.issues
      .filter((issue) => issue.deferrals.length > 0)
      .map(
        (issue) =>
          `<li><span class="path">${escapeHtml(issue.path)}</span>${issue.deferrals.map((line) => inlineMarkup(line)).join('<br>')}</li>`,
      ),
  );
  const unrecognised = roadmap.features.flatMap((feature) =>
    [...feature.issues, ...feature.documents]
      .filter((issue) => issue.state === 'unrecognised')
      .map(
        (issue) =>
          `<li><span class="path">${escapeHtml(issue.path)}</span>${escapeHtml(issue.status)}</li>`,
      ),
  );

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Hyper roadmap</title>',
    `<style>${STYLE}</style>`,
    '</head><body><main>',
    '<h1>Where we are</h1>',
    `<p class="summary">${roadmap.features.length} efforts · ${roadmap.issueCount} issues · ${roadmap.openCount} open</p>`,
    intent === null ? '' : `<section class="intent">${intentHtml(intent)}</section>`,
    htmlSection('In flight', inFlight.length, inFlight.map(htmlFeature).join('')),
    htmlSection(
      'Not started',
      byPhase(roadmap, 'open').length,
      byPhase(roadmap, 'open').map(htmlFeature).join(''),
    ),
    htmlSection(
      'Ready to pick up',
      grabbable.length,
      grabbable.length === 0 ? '' : `<ul class="pick">${grabbable.join('')}</ul>`,
    ),
    htmlSection(
      'Unrecognised status',
      unrecognised.length,
      unrecognised.length === 0 ? '' : `<details open><ul>${unrecognised.join('')}</ul></details>`,
    ),
    htmlSection(
      'Deferred work inside settled issues',
      deferred.length,
      deferred.length === 0
        ? ''
        : `<details><summary>Settled issues that declared a deferral or an out-of-scope note</summary><ul>${deferred.join('')}</ul></details>`,
    ),
    htmlSection(
      'Complete',
      byPhase(roadmap, 'complete').length,
      htmlChips(byPhase(roadmap, 'complete')),
    ),
    htmlSection(
      'No issues — spec, research or notes only',
      byPhase(roadmap, 'no-issues').length,
      htmlChips(byPhase(roadmap, 'no-issues')),
    ),
    '</main></body></html>',
  ].join('\n');
};

const OPEN_COMMANDS = new Map<string, string>([
  ['darwin', 'open'],
  ['win32', 'start'],
]);

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  const root = join(process.cwd(), '.scratch');
  if (existsSync(root) && statSync(root).isDirectory()) {
    const roadmap = buildRoadmap(root);
    const intent = readIntent(root);
    if (process.argv.includes('--html')) {
      // `.scratch/**` is gitignored except for markdown, so the render never enters the tree.
      const destination = join(root, 'roadmap.html');
      writeFileSync(destination, `${renderRoadmapHtml(roadmap, intent)}\n`);
      console.log(destination);
      if (process.argv.includes('--open')) {
        execFileSync(OPEN_COMMANDS.get(process.platform) ?? 'xdg-open', [destination]);
      }
    } else console.log(renderRoadmap(roadmap, intent));
  } else {
    console.error(`No .scratch directory at ${root}`);
    process.exitCode = 1;
  }
}
