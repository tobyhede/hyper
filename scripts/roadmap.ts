import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
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
  /** Orthogonal collections this issue belongs to, such as a release scope. */
  readonly tags: readonly string[];
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
  /**
   * Files under `issues/` carrying no `Status:` line at all. Reported rather than
   * skipped: a ticket the roll-up cannot see reads as work that does not exist.
   */
  readonly unstatused: readonly string[];
}

export interface Roadmap {
  readonly features: readonly FeatureRoadmap[];
  readonly issueCount: number;
  readonly openCount: number;
}

export interface ReleaseScope {
  readonly title: string;
  readonly tag: string;
  readonly goal: string;
  readonly definition: string | null;
  /** Open issue whose completion closes the release dependency graph. */
  readonly gate: string | null;
  /** Generated, importable Space directory relative to `.scratch/`. */
  readonly space: string | null;
}

/**
 * Both `Status: resolved` and `**Status:** resolved` are current, and one family
 * bolds the whole line (`**Status: delivered.**`). A scan that misses a spelling
 * reports live efforts as unstatused, so all three are matched here.
 */
const STATUS_PATTERN = /^\*{0,2}status:\*{0,2}[ \t]+(.+)$/iu;
const BLOCKED_PATTERN = /^\*{0,2}blocked by:?\*{0,2}[ \t]*(.*)$/iu;
const TAGS_PATTERN = /^\*{0,2}tags:\*{0,2}[ \t]+(.+)$/iu;
const RELEASE_TAG_PATTERN = /^tag:[ \t]+(.+)$/iu;
const RELEASE_GOAL_PATTERN = /^goal:[ \t]+(.+)$/iu;
const RELEASE_DEFINITION_PATTERN = /^definition:[ \t]+(.+)$/iu;
const RELEASE_GATE_PATTERN = /^gate:[ \t]+(.+)$/iu;
const RELEASE_SPACE_PATTERN = /^space:[ \t]+(.+)$/iu;
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

const readTags = (lines: readonly string[]): readonly string[] => {
  for (const line of lines) {
    const matched = TAGS_PATTERN.exec(line);
    if (matched === null) continue;
    return [
      ...new Set(
        (matched[1] ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
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
  readonly tags: readonly string[];
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
    tags: readTags(lines),
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
  readonly unstatused: readonly string[];
}

const scanFeature = (root: string, slug: string): ScannedFeature => {
  const directory = join(root, slug);
  const tickets = markdownFilesIn(join(directory, 'issues')).map((file) => ({
    file,
    issue: parseFile(root, file),
  }));
  const issues = tickets
    .map((ticket) => ticket.issue)
    .filter((issue): issue is ParsedIssue => issue !== null);
  const unstatused = tickets
    .filter((ticket) => ticket.issue === null)
    .map((ticket) => relative(root, ticket.file));
  const documents = markdownFilesIn(directory)
    .map((file) => parseFile(root, file))
    .filter((document): document is ParsedIssue => document !== null);
  return { slug, issues, documents, unstatused };
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
      unstatused: feature.unstatused,
    };
  });

  const issueCount = features.reduce((total, feature) => total + feature.issues.length, 0);
  const openCount = features.reduce(
    (total, feature) => total + feature.issues.filter((issue) => !isSettled(issue.state)).length,
    0,
  );
  return { features, issueCount, openCount };
};

const readMetadata = (lines: readonly string[], pattern: RegExp): string | null => {
  for (const line of lines) {
    const matched = pattern.exec(line);
    if (matched !== null) return (matched[1] ?? '').trim();
  }
  return null;
};

/** `ROADMAP.md` declares the release collection that the issue scan renders. */
export const readReleaseScope = (root: string): ReleaseScope | null => {
  const file = join(root, 'ROADMAP.md');
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split('\n');
  const tag = readMetadata(lines, RELEASE_TAG_PATTERN);
  const goal = readMetadata(lines, RELEASE_GOAL_PATTERN);
  if (tag === null || goal === null) {
    throw new Error('ROADMAP.md must declare both `Tag:` and `Goal:`.');
  }
  return {
    title: readTitle(lines, 'Release scope'),
    tag,
    goal,
    definition: readMetadata(lines, RELEASE_DEFINITION_PATTERN),
    gate: readMetadata(lines, RELEASE_GATE_PATTERN),
    space: readMetadata(lines, RELEASE_SPACE_PATTERN),
  };
};

const byPhase = (roadmap: Roadmap, phase: FeaturePhase): readonly FeatureRoadmap[] =>
  roadmap.features.filter((feature) => feature.phase === phase);

const openIssues = (feature: FeatureRoadmap): readonly ScratchIssue[] =>
  feature.issues.filter((issue) => !isSettled(issue.state));

const issueTagSuffix = (issue: ScratchIssue): string =>
  issue.tags.length === 0 ? '' : `  [${issue.tags.join(', ')}]`;

const issueLine = (issue: ScratchIssue): string => {
  const number = issue.number ?? '--';
  const blocked =
    issue.unmetBlockers.length > 0 ? `  blocked by ${issue.unmetBlockers.join(', ')}` : '';
  return `    ${number}  ${issue.state.padEnd(15)} ${issue.title}${issueTagSuffix(issue)}${blocked}`;
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

interface TaggedIssue {
  readonly feature: string;
  readonly issue: ScratchIssue;
}

export interface PlannedReleaseIssue extends TaggedIssue {
  readonly reference: string;
  /** Longest open dependency distance from a currently unblocked release issue. */
  readonly depth: number;
}

export interface ReleasePlan {
  readonly criticalPath: readonly PlannedReleaseIssue[];
  readonly parallel: readonly PlannedReleaseIssue[];
}

const issuesTagged = (roadmap: Roadmap, tag: string): readonly TaggedIssue[] =>
  roadmap.features.flatMap((feature) =>
    feature.issues
      .filter((issue) => issue.tags.includes(tag))
      .map((issue) => ({ feature: feature.slug, issue })),
  );

const taggedReference = ({ feature, issue }: TaggedIssue): string =>
  `${feature}/${issue.number ?? '--'}`;

/**
 * Unit-weight critical path to the declared release gate. Issue files remain the
 * dependency source; `ROADMAP.md` names only which sink means "release done".
 */
export const planRelease = (roadmap: Roadmap, release: ReleaseScope): ReleasePlan => {
  const taggedIssues = issuesTagged(roadmap, release.tag).map((tagged) => ({
    ...tagged,
    reference: taggedReference(tagged),
  }));
  const open = taggedIssues.filter(({ issue }) => !isSettled(issue.state));
  const byReference = new Map(open.map((tagged) => [tagged.reference, tagged]));

  const missing = open.flatMap(({ issue, reference }) =>
    issue.unmetBlockers
      .filter((blocker) => !byReference.has(blocker))
      .map((blocker) => `${reference} → ${blocker}`),
  );
  if (missing.length > 0) {
    throw new Error(`Open release blockers must carry tag ${release.tag}: ${missing.join(', ')}`);
  }

  const depths = new Map<string, number>();
  const depthInProgress = new Set<string>();
  const depthOf = (reference: string): number => {
    const known = depths.get(reference);
    if (known !== undefined) return known;
    if (depthInProgress.has(reference))
      throw new Error(`Release dependency cycle at ${reference}.`);
    depthInProgress.add(reference);
    const tagged = byReference.get(reference);
    if (tagged === undefined) throw new Error(`Unknown open release issue ${reference}.`);
    const depth =
      tagged.issue.unmetBlockers.length === 0
        ? 0
        : Math.max(...tagged.issue.unmetBlockers.map((blocker) => depthOf(blocker))) + 1;
    depthInProgress.delete(reference);
    depths.set(reference, depth);
    return depth;
  };

  const planned = open.map((tagged) => ({ ...tagged, depth: depthOf(tagged.reference) }));
  /** Every open issue as flat parallel work, for the two cases with no path to draw. */
  const withoutCriticalPath = (): ReleasePlan => ({
    criticalPath: [],
    parallel: [...planned].sort(
      (left, right) => left.depth - right.depth || left.reference.localeCompare(right.reference),
    ),
  });
  if (release.gate === null) return withoutCriticalPath();
  if (!byReference.has(release.gate)) {
    // Reaching the gate is how a release ends, not a misconfiguration to refuse
    // every command over. A settled gate leaves no critical path to trace to it,
    // and any tagged work that outlived it is ordinary parallel work. Only a gate
    // naming nothing tagged for this release is an error.
    if (!taggedIssues.some(({ reference }) => reference === release.gate)) {
      throw new Error(`Release gate ${release.gate} is not an issue tagged ${release.tag}.`);
    }
    return withoutCriticalPath();
  }

  const paths = new Map<string, readonly string[]>();
  const pathTo = (reference: string): readonly string[] => {
    const known = paths.get(reference);
    if (known !== undefined) return known;
    const tagged = byReference.get(reference);
    if (tagged === undefined) throw new Error(`Unknown open release issue ${reference}.`);
    const candidates = tagged.issue.unmetBlockers
      .map((blocker) => pathTo(blocker))
      .sort(
        (left, right) =>
          right.length - left.length || left.join('\u0000').localeCompare(right.join('\u0000')),
      );
    const path = [...(candidates[0] ?? []), reference];
    paths.set(reference, path);
    return path;
  };

  const criticalReferences = pathTo(release.gate);
  const criticalSet = new Set(criticalReferences);
  const plannedByReference = new Map(planned.map((issue) => [issue.reference, issue]));
  return {
    criticalPath: criticalReferences.map((reference) => {
      const issue = plannedByReference.get(reference);
      if (issue === undefined) throw new Error(`Missing planned release issue ${reference}.`);
      return issue;
    }),
    parallel: planned
      .filter(({ reference }) => !criticalSet.has(reference))
      .sort(
        (left, right) => left.depth - right.depth || left.reference.localeCompare(right.reference),
      ),
  };
};

const releaseIssueLine = ({ feature, issue }: TaggedIssue): string => {
  const reference = `${feature}/${issue.number ?? '--'}`;
  const blocked =
    issue.unmetBlockers.length > 0 ? `  blocked by ${issue.unmetBlockers.join(', ')}` : '';
  return `  ${reference.padEnd(44)} ${issue.state.padEnd(15)} ${issue.title}${issueTagSuffix(issue)}${blocked}`;
};

export const renderRoadmap = (roadmap: Roadmap, release: ReleaseScope | null = null): string => {
  const inFlight = [...byPhase(roadmap, 'in-flight')].sort(
    (left, right) => openIssues(left).length - openIssues(right).length,
  );
  const open = byPhase(roadmap, 'open');
  const complete = byPhase(roadmap, 'complete');
  const untracked = byPhase(roadmap, 'no-issues');
  const grabbable = roadmap.features.flatMap((feature) =>
    openIssues(feature)
      .filter((issue) => issue.unmetBlockers.length === 0 && issue.state !== 'claimed')
      .map(
        (issue) =>
          `  ${feature.slug}/${issue.number ?? '--'}  ${issue.title}${issueTagSuffix(issue)}`,
      ),
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
  const unstatused = roadmap.features.flatMap((feature) =>
    feature.unstatused.map((path) => `  ${path}`),
  );
  const releaseIssues = release === null ? [] : issuesTagged(roadmap, release.tag);
  const releaseSettled = releaseIssues.filter(({ issue }) => isSettled(issue.state)).length;
  const openReleaseIssues = releaseIssues.filter(({ issue }) => !isSettled(issue.state));
  const releasePlan = release === null ? null : planRelease(roadmap, release);

  const lines: string[] = [
    `.scratch — ${roadmap.features.length} efforts · ${roadmap.issueCount} issues · ${roadmap.openCount} open`,
    ...(release === null
      ? []
      : [
          '',
          `${release.title.toUpperCase()} — ${releaseSettled}/${releaseIssues.length} settled`,
          `  ${release.goal}`,
          ...(release.definition === null ? [] : [`  Definition: ${release.definition}`]),
          ...(release.space === null ? [] : [`  Space: ${release.space}`]),
          // Keyed on whether there is a path to draw rather than on whether a
          // gate was declared: `planRelease` answers an empty critical path for
          // a gate already reached as well as for a release that declared none,
          // and an open gate always contributes at least itself.
          ...(releasePlan === null || releasePlan.criticalPath.length === 0
            ? openReleaseIssues.map(releaseIssueLine)
            : [
                `  CRITICAL PATH — ${releasePlan.criticalPath.length}`,
                ...releasePlan.criticalPath.map(releaseIssueLine),
                `  PARALLEL WORK — ${releasePlan.parallel.length}`,
                ...releasePlan.parallel.map(releaseIssueLine),
              ]),
        ]),
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
  if (unstatused.length > 0) {
    lines.push('', `NO STATUS LINE — ${unstatused.length} (invisible to this scan)`, ...unstatused);
  }
  lines.push('', `COMPLETE — ${complete.length}`, ...wrapSlugs(complete));
  lines.push(
    '',
    `NO ISSUES — ${untracked.length} (spec, research or notes only)`,
    ...wrapSlugs(untracked),
  );
  return lines.join('\n');
};

const stableRoadmapUuid = (name: string): string => {
  const hex = createHash('sha256').update(`hyper-release-roadmap:${name}`).digest('hex');
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const markdownCard = (
  id: string,
  planned: PlannedReleaseIssue,
  cardsDirectory: string,
  scratchRoot: string,
): string => {
  const issuePath = relative(cardsDirectory, join(scratchRoot, planned.issue.path)).replaceAll(
    sep,
    '/',
  );
  const blockers =
    planned.issue.unmetBlockers.length === 0
      ? 'None'
      : planned.issue.unmetBlockers.map((blocker) => `\`${blocker}\``).join(', ');
  return [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(`${planned.reference} — ${planned.issue.title}`)}`,
    'kind: markdown',
    '---',
    '',
    `# ${planned.issue.title}`,
    '',
    `- **Reference:** \`${planned.reference}\``,
    `- **Status:** \`${planned.issue.state}\``,
    `- **Tags:** ${planned.issue.tags.map((tag) => `\`${tag}\``).join(', ')}`,
    `- **Blocked by:** ${blockers}`,
    '',
    `[Open issue](${issuePath})`,
    '',
  ].join('\n');
};

/** Generate one ordinary Space that dogfoods the open release dependency graph. */
export const writeReleaseSpace = (
  root: string,
  roadmap: Roadmap,
  release: ReleaseScope,
): string | null => {
  if (release.space === null) return null;
  const scratchRoot = resolve(root);
  const destination = resolve(scratchRoot, release.space);
  if (destination === scratchRoot || !destination.startsWith(`${scratchRoot}${sep}`)) {
    throw new Error(`Release Space must stay inside ${scratchRoot}: ${release.space}`);
  }

  const plan = planRelease(roadmap, release);
  const issues = [...plan.criticalPath, ...plan.parallel].sort((left, right) =>
    left.reference.localeCompare(right.reference),
  );
  const idByReference = new Map(
    issues.map(({ reference }) => [reference, stableRoadmapUuid(`issue:${reference}`)]),
  );
  const cardId = (reference: string): string => {
    const id = idByReference.get(reference);
    if (id === undefined) throw new Error(`No roadmap Card for ${reference}.`);
    return id;
  };

  const cardsDirectory = join(destination, 'cards');
  rmSync(cardsDirectory, { recursive: true, force: true });
  mkdirSync(cardsDirectory, { recursive: true });
  for (const planned of issues) {
    writeFileSync(
      join(cardsDirectory, `${planned.reference.replace('/', '-')}.md`),
      markdownCard(cardId(planned.reference), planned, cardsDirectory, scratchRoot),
    );
  }

  const criticalEdges = plan.criticalPath.slice(1).map((issue, index) => ({
    from: cardId(plan.criticalPath[index]?.reference ?? ''),
    to: cardId(issue.reference),
  }));
  const criticalKeys = new Set(criticalEdges.map(({ from, to }) => `${from}\u0000${to}`));
  const parallelEdges = issues.flatMap((planned) =>
    planned.issue.unmetBlockers.flatMap((blocker) => {
      const edge = { from: cardId(blocker), to: cardId(planned.reference) };
      return criticalKeys.has(`${edge.from}\u0000${edge.to}`) ? [] : [edge];
    }),
  );

  const parallelSlotByDepth = new Map<number, number>();
  const criticalIndex = new Map(
    plan.criticalPath.map(({ reference }, index) => [reference, index]),
  );
  const positions = Object.fromEntries(
    issues.map((planned) => {
      const onCriticalPath = criticalIndex.get(planned.reference);
      if (onCriticalPath !== undefined) {
        return [cardId(planned.reference), { x: 0, y: onCriticalPath * 300, open: false }];
      }
      const slot = parallelSlotByDepth.get(planned.depth) ?? 0;
      parallelSlotByDepth.set(planned.depth, slot + 1);
      return [
        cardId(planned.reference),
        { x: 460 + slot * 420, y: planned.depth * 300, open: false },
      ];
    }),
  );

  const layoutId = stableRoadmapUuid(`layout:${release.tag}`);
  const criticalGraphId = stableRoadmapUuid(`graph:${release.tag}:critical`);
  const parallelGraphId = stableRoadmapUuid(`graph:${release.tag}:parallel`);
  const space = {
    version: 1,
    id: stableRoadmapUuid(`space:${release.tag}`),
    title: `${release.title} roadmap`,
    layouts: [
      {
        id: layoutId,
        title: 'Release dependency map',
        kind: 'positioned',
        positions,
        graphs: [
          {
            id: criticalGraphId,
            title: 'Critical path',
            color: '#dc2626',
            edges: criticalEdges,
          },
          {
            id: parallelGraphId,
            title: 'Parallel paths',
            color: '#2563eb',
            edges: parallelEdges,
          },
        ],
        activeGraph: criticalGraphId,
      },
    ],
    defaultRenderer: layoutId,
  };
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'space.json'), `${JSON.stringify(space, null, 2)}\n`);
  return destination;
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

const htmlTags = (issue: ScratchIssue): string =>
  issue.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');

const htmlIssue = (issue: ScratchIssue): string => {
  const blocked =
    issue.unmetBlockers.length > 0
      ? `<span class="blocked">blocked by ${issue.unmetBlockers.map((key) => escapeHtml(key)).join(', ')}</span>`
      : '';
  return [
    '<li class="issue">',
    `<span class="num">${escapeHtml(issue.number ?? '--')}</span>`,
    `<span class="badge ${issue.state}">${issue.state}</span>`,
    htmlTags(issue),
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

const htmlReleaseIssue = ({ feature, issue }: TaggedIssue): string => {
  const blocked =
    issue.unmetBlockers.length > 0
      ? `<span class="blocked">blocked by ${issue.unmetBlockers.map((key) => escapeHtml(key)).join(', ')}</span>`
      : '';
  return [
    '<li class="issue">',
    `<span class="ref">${escapeHtml(feature)}/${escapeHtml(issue.number ?? '--')}</span>`,
    `<span class="badge ${issue.state}">${issue.state}</span>`,
    htmlTags(issue),
    `<a class="title" href="${escapeHtml(issue.path)}">${inlineMarkup(issue.title)}</a>`,
    blocked,
    '</li>',
  ].join('');
};

const htmlReleaseScope = (roadmap: Roadmap, release: ReleaseScope): string => {
  const issues = issuesTagged(roadmap, release.tag);
  const settled = issues.filter(({ issue }) => isSettled(issue.state)).length;
  const open = issues.filter(({ issue }) => !isSettled(issue.state));
  const plan = planRelease(roadmap, release);
  const definition =
    release.definition === null
      ? ''
      : `<p><a href="${escapeHtml(release.definition)}">Definition of Done</a></p>`;
  const space =
    release.space === null
      ? ''
      : `<p><a href="${escapeHtml(`${release.space}/space.json`)}">Dogfood roadmap Space</a></p>`;
  // As in `renderRoadmap`: an empty critical path is a release with no gate
  // declared or one whose gate has been reached, and neither has a path to draw.
  const issueLists =
    plan.criticalPath.length === 0
      ? `<ul>${open.map(htmlReleaseIssue).join('')}</ul>`
      : [
          `<h3>Critical path<span class="tally">${plan.criticalPath.length}</span></h3>`,
          `<ol class="release-path">${plan.criticalPath.map(htmlReleaseIssue).join('')}</ol>`,
          `<h3>Parallel work<span class="tally">${plan.parallel.length}</span></h3>`,
          `<ul>${plan.parallel.map(htmlReleaseIssue).join('')}</ul>`,
        ].join('');
  return [
    '<section class="release-scope">',
    `<h2>${escapeHtml(release.title)}<span class="tally">${settled}/${issues.length} settled</span></h2>`,
    `<p>${inlineMarkup(release.goal)}</p>`,
    definition,
    space,
    issueLists,
    '</section>',
  ].join('');
};

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
.tag {
  color: var(--muted); background: var(--bg); border: 1px solid var(--line);
  border-radius: 999px; padding: .08rem .38rem; font-size: .68rem; white-space: nowrap;
}
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
.pick .tag { margin-left: .5rem; }
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
.release-scope {
  background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent);
  border-radius: 10px; padding: .4rem 1.2rem 1.1rem; margin-bottom: 2.5rem;
}
.release-scope h2 { margin-top: .8rem; }
.release-scope h3 {
  display: flex; align-items: center; gap: .5rem; font-size: .82rem; margin: 1.2rem 0 .4rem;
}
.release-scope p { margin: .5rem 0; color: var(--ink); }
.release-scope ul, .release-scope ol { list-style: none; margin: .4rem 0 0; padding: 0; }
.release-path .issue { border-left: 2px solid var(--accent); padding-left: .65rem; }
.release-scope .ref { font-family: ui-monospace, monospace; color: var(--muted); font-size: .8rem; }
`;

export const renderRoadmapHtml = (
  roadmap: Roadmap,
  release: ReleaseScope | null = null,
): string => {
  const inFlight = [...byPhase(roadmap, 'in-flight')].sort(
    (left, right) => openIssues(left).length - openIssues(right).length,
  );
  const grabbable = roadmap.features.flatMap((feature) =>
    openIssues(feature)
      .filter((issue) => issue.unmetBlockers.length === 0 && issue.state !== 'claimed')
      .map(
        (issue) =>
          `<li><a href="${escapeHtml(issue.path)}"><span class="ref">${escapeHtml(feature.slug)}/${escapeHtml(issue.number ?? '--')}</span>${inlineMarkup(issue.title)}</a>${htmlTags(issue)}</li>`,
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
  const unstatused = roadmap.features.flatMap((feature) => feature.unstatused);

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Hyper roadmap</title>',
    `<style>${STYLE}</style>`,
    '</head><body><main>',
    '<h1>Where we are</h1>',
    `<p class="summary">${roadmap.features.length} efforts · ${roadmap.issueCount} issues · ${roadmap.openCount} open</p>`,
    release === null ? '' : htmlReleaseScope(roadmap, release),
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
      'No status line — invisible to this scan',
      unstatused.length,
      unstatused.length === 0
        ? ''
        : `<details open><ul>${unstatused
            .map(
              (path) =>
                `<li><a class="path" href="${escapeHtml(path)}">${escapeHtml(path)}</a></li>`,
            )
            .join('')}</ul></details>`,
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
    const release = readReleaseScope(root);
    const wantsHtml = process.argv.includes('--html');
    // `--html` only *implies* a Space, so a render with no Space to generate is
    // a complete run. `--space` asks for one outright, and a run that produces
    // nothing has to say so rather than exit 0 on an empty stdout.
    const explicitSpace = process.argv.includes('--space');
    const wantsSpace = explicitSpace || wantsHtml;
    if (wantsHtml) {
      // The generated render and dogfood Space are ignored build artifacts.
      const destination = join(root, 'roadmap.html');
      writeFileSync(destination, `${renderRoadmapHtml(roadmap, release)}\n`);
      console.log(destination);
      if (process.argv.includes('--open')) {
        execFileSync(OPEN_COMMANDS.get(process.platform) ?? 'xdg-open', [destination]);
      }
    }
    if (wantsSpace) {
      const space = release === null ? null : writeReleaseSpace(root, roadmap, release);
      if (space !== null) console.log(space);
      else if (explicitSpace) {
        console.error(
          release === null
            ? `--space needs a release scope: no ROADMAP.md at ${join(root, 'ROADMAP.md')}.`
            : 'ROADMAP.md declares no `Space:`, so --space has nowhere to write.',
        );
        process.exitCode = 1;
      }
    }
    if (!wantsHtml && !wantsSpace) console.log(renderRoadmap(roadmap, release));
  } else {
    console.error(`No .scratch directory at ${root}`);
    process.exitCode = 1;
  }
}
