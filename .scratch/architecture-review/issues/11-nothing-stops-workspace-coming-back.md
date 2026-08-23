# Nothing stops workspace coming back

Status: resolved

Surfaced by: issue 08's own review rounds. The rename landed (PR #115), and the
standards axis asked why it landed without the executable guard the repo gives
its other renames. It was deferred there on purpose — issue 08 requires one
commit that does nothing else, and a new guard is new surface, not a rename.

Blocked by: None. PR #115 merged as `005716b` with all four CI jobs green, which
was the only thing in the way — it touches
`test/unit/current-domain-vocabulary.test.ts` by one path string, and this ticket
adds a block to the same file.

## The defect

`CONTEXT.md` lists **workspace** under Space's `_Avoid_`, and the code drifted
from that entry for months without anything noticing. Issue 08 closed the drift.
Nothing stops it reopening.

The repo already treats this as a solved problem for its other two renames.
`test/unit/current-domain-vocabulary.test.ts` carries a `describe` block per
rename, each scanning tracked files rather than a hand-kept list of places
someone remembered to look:

- **ADR 0041** (Route → Graph) — bans the retired name in *compound* shapes and
  deliberately permits the bare English word, because Hono routes requests, ELK
  routes an edge, and TanStack Router owns a URL route. One file exemption
  (`packages/app/src/router.tsx`).
- **ADR 0055** (the canvas renderer named once) — no exemption list at all,
  because those names have no qualified sense anywhere. Its own doc comment
  records what it caught when it was added: `docs/agents/ui.md`, the
  read-before-touching authority for the sidebar, still pointing the next agent
  at a deleted module and a renamed prop.

Issue 08's rename is the same kind of event and has no such block. It is also the
one most likely to recur: unlike Route and the renderer names, "workspace" is a
word an agent reaches for unprompted, because it is what every other tool in the
ecosystem calls this shape of thing.

## Why the existing patterns do not transfer

ADR 0041's trick was that *compounds* are unambiguous while the bare word is
fine. **For workspace that is inverted, and no shape rule separates the senses.**
The monorepo sense is written in compounds too: `workspaceAliases`,
`workspacePackages`, `probedWorkspaces`, `ListedWorkspace`, `everyWorkspaceOn`,
`workspaceAt`. A `workspace[A-Z]` ban reports all six.

Measured on the post-rename tree, a bare-word scan over tracked files — already
excluding the three `HISTORICAL_TREES` (`docs/adr/`, `docs/superpowers/`,
`.scratch/`) — hits **25 files and roughly 131 occurrences, every one of them the
pnpm/monorepo sense**. An exemption list that long is the "ever-growing list of
exceptions" ADR 0041's own doc comment rejects.

`CONTEXT.md` is the sharpest case: the glossary has to name the word in order to
avoid it, so any bare-word scan reports the entry that defines the rule it is
enforcing.

## What to build

**Scope the scan by path, not by shape.** The domain sense can only appear where
the domain lives. Scan `packages/**` and `src/**` and the exemption list
collapses to a filename rule plus three named files:

| exemption | why |
|---|---|
| `package.json`, by filename | the `workspace:` protocol, in six manifests |
| `packages/app/workspace-aliases.ts` | the module is the pnpm sense |
| `packages/app/vite.config.ts` | imports it |
| `packages/app/http-server-build.config.ts` | imports it |

That is sharper than ADR 0041's, which carries one file for the same job.
Everything else holding the word — `scripts/check-typescript-toolchain.ts` (37
hits), `test/unit/check-typescript-toolchain.test.ts` (34), `pnpm-lock.yaml`,
`eslint.config.js`, `.coderabbit.yaml`, `.github/workflows/ci.yml`, the root
manifests — falls outside the scanned paths by construction rather than by
exemption.

One straggler needs no exemption at all: `packages/persistence/src/repository.ts:18`
says "server code imports workspace packages by name". Reword it to name
`@project/*` and the file leaves the list.

Follow the ADR 0055 block verbatim as the template, including the two things that
make these guards hold their sharpness over time:

1. **The self-test block.** A pattern that silently stopped matching would pass
   every file forever, so the guard is read against the names it must report and
   against the ones it must stay silent on — here, `workspaceAliases` and a
   `"workspace:*"` dependency line.
2. **The exemption-earning test.** ADR 0041's block asserts every exempted file
   still contains a hit. An exemption outlives its reason silently, and the scan
   then covers less than it reads as covering.

Also assert the scan still *reaches* the kinds of file the rename touched —
`.tsx`, `.ts`, `.css` — in the idiom both existing blocks use, so a file list
that quietly stopped resolving cannot report nothing forever.

Add a gotcha line to `AGENTS.md` recording that the word is guarded and where the
pnpm sense is allowed. `CLAUDE.md` is a symlink, so that is one edit.

## Decide before writing: are docs in scope?

Path-scoping to `packages/**` and `src/**` leaves `AGENTS.md` (3 hits),
`README.md` (1), `docs/agents/ui.md` (1), `docs/agents/build-tooling.md` (1) and
`CONTEXT.md` (1) unguarded. All five are the monorepo sense today, so including
them costs five more exemptions — and `CONTEXT.md`'s is permanent, since the
glossary must name what it avoids.

The argument for paying it: **docs are where both existing guards found their
bug.** ADR 0055's block caught `docs/agents/ui.md`, and issue 08's own third
review round caught the same file again, contradicting the module it documents in
the same commit that fixed the module. A guard that cannot read the
read-before-touching documents is blind in the place the evidence says the defect
lands.

The argument against: five exemptions on six total hits is a guard that is almost
entirely exceptions, which is the failure mode ADR 0041 named.

A middle option worth costing: scan docs for the **rename's own shapes** —
`Workspace[A-Z]`, `workspace-` in a test id or class position — rather than the
bare word. The monorepo prose is all bare ("workspace packages", "a pnpm
workspace", "the workspace `exports`"), so that rule may separate the senses in
prose even though it cannot in code. Check it against the five files before
committing to it.

## Acceptance criteria

- [x] `test/unit/current-domain-vocabulary.test.ts` carries a `describe` block for
      this rename, with a self-test block and an exemption-earning test.
- [x] Reintroducing `WorkspaceSidebar`, `workspaceTitle`, a `workspace-sidebar`
      test id or a `.workspace-selection` class anywhere in `packages/**` or
      `src/**` fails the suite.
- [x] `workspaceAliases`, `workspacePackages` and a `"workspace:*"` dependency
      line do **not** fail it, and the self-test says so by name.
- [x] Every exemption is asserted to still contain a hit.
- [x] The docs question is decided in the ticket's comments, with the count that
      decided it.
- [x] `AGENTS.md` records the guard and where the pnpm sense is allowed.
- [x] `pnpm verify` passes with real output quoted. No UI or graph change, so
      `pnpm e2e` and `pnpm e2e:ladle` are not required unless something drags
      them in.

## Decided — do not re-open

- **This is not an ADR.** It enforces a `CONTEXT.md` entry that already exists
  and that issue 08 already brought the code into line with. Nothing about the
  model is unsettled.
- **No production code changes.** The one exception is the `repository.ts:18`
  comment reword, which removes an exemption rather than adding behaviour. If the
  guard wants a production change to pass, that is a finding to report, not to
  fix here.
- **`pnpm-workspace.yaml`, the `workspace:` protocol entries and
  `packages/app/workspace-aliases.ts` are the monorepo's vocabulary and stay
  exactly as they are.** A guard that reports them is wrong, not strict.


## Comments

**2026-08-22 — resolved.** The guard landed off `origin/main` at `005716b`, as a
`describe` block plus its self-test block appended to
`test/unit/current-domain-vocabulary.test.ts`, following ADR 0055's as the
template.

### The docs question, decided: documents are in scope, by shape, for zero exemptions

The middle option holds, and the count that decided it is **zero**. The
compound pattern — the retired identifier, test-id, CSS-block and module-name
shapes — was run over all **46 tracked Markdown files outside the historical
trees** and reported **none of them**. The bare hits the ticket lists
(`AGENTS.md` 3, `README.md` 1, `docs/agents/ui.md` 1,
`docs/agents/build-tooling.md` 1, `CONTEXT.md` 1) are **seven across five
files**, not the six the ticket says — its "five exemptions on six total hits"
was off by one, because `AGENTS.md` holds three. The correction does not move
the decision: every one of the seven is the monorepo sense written bare — "workspace packages", "a pnpm workspace", "the
workspace `exports`", "Both shadcn workspaces", and the glossary entry that has
to name what it avoids. So the strongest objection — five exemptions on seven
hits — does not arise: the document arm carries **no exemption list at all**,
which is the same shape ADR 0055's block has.

That is worth having for the reason the ticket gives: documents are where both
existing guards found their bug, and a guard that cannot read the
read-before-touching authorities is blind where the evidence says the defect
lands. Proven both ways — appending `WorkspaceSidebar` to `docs/agents/ui.md`
fails the suite, and so does a line pointing an agent at `open-workspace.ts`,
while `- The workspace packages under \`packages/\`.` appended to `AGENTS.md`
leaves it green.

**The arm stops at Markdown rather than covering the whole non-domain tree.**
Extending it to `scripts/`, `test/` and `.oxlintrc.json` buys three exemptions
(`scripts/check-typescript-toolchain.ts`, `test/unit/check-typescript-toolchain.test.ts`,
`.oxlintrc.json` — `WORKSPACE_GLOB`, `ListedWorkspace`, `workspaceAt`,
`everyWorkspaceOn`) for three toolchain files no domain name can land in. Not
paid.

### Two shape carve-outs, not exceptions

The document arm carries two negative lookarounds, in the idiom ADR 0041's
`Routed*` established — the sense falls out of the shape rather than out of a
file list:

- `workspace-` does not match `workspace-aliases`, pnpm's alias module.
- `-workspace` does not match `pnpm-workspace`.

Both exist so the `AGENTS.md` line saying *where the monorepo sense is allowed*
can name the two files it lives in. Neither was needed by any document in the
tree before this commit; each has exactly one live justification and it is that
line.

The camelCase arm was **not** given the matching carve-out for `workspaceAliases`
and `workspacePackages`. No document names them today, and an exception without a
live justification is the thing the ticket warns about.

### What the path-scoped arm cost

Exactly the four exemptions the ticket predicted: `package.json` as a filename
rule (six manifests, and a new package brings another), plus
`packages/app/workspace-aliases.ts`, `packages/app/vite.config.ts` and
`packages/app/http-server-build.config.ts`. The one straggler,
`packages/persistence/src/repository.ts:18`, was reworded to name `@project/*`
and left the list, exactly as proposed — the only production file this commit
touches.

**The exemption-earning test is split, because the manifest rule cannot be
asserted the way a path can.** Each of the three named modules must still
contain a hit. The manifest rule is asserted as a rule instead: at least one
manifest under the scanned paths still uses the protocol. Requiring *every*
manifest to hold a hit fails on `packages/core/package.json`, which declares no
sibling and holds none — it is a leaf, not a stale exemption. Proven by pointing
one entry at `packages/app/src/space.ts`, which fails with
`packages/app/src/space.ts no longer needs its exemption`.

### Red/green pairs, all run

Appended to a tracked file, suite run, file reverted:

| probe | file | result |
|---|---|---|
| `WorkspaceSidebar` | `packages/app/src/components/SpaceSidebar.tsx` | fails |
| `workspaceTitle` | `packages/app/src/space.ts` | fails |
| `workspace-sidebar` test id | `packages/app/e2e/graph.ts` | fails |
| `.workspace-selection` class | `packages/app/src/styles.css` | fails |
| the bare word | `src/persistence/space-repository.ts` | fails |
| `WorkspaceSidebar` in prose | `docs/agents/ui.md` | fails |
| `open-workspace.ts` in prose | `docs/agents/ui.md` | fails |
| "The workspace packages under `packages/`" | `AGENTS.md` | **green** |

`workspaceAliases`, `workspacePackages` and a `"workspace:*"` dependency line are
named in the self-test block, which says which mechanism keeps each silent: the
bare word matches all three, and it is the exemption predicate — not the pattern
— that lets them through.

### Verification

`pnpm verify` green, exit 0:

```
> pnpm typecheck:toolchain && pnpm typecheck && pnpm typecheck:packages && pnpm ui:catalog:check && pnpm lint && pnpm lint:anti-slop && pnpm format:check && pnpm test:coverage
...
 Test Files  151 passed (151)
      Tests  1666 passed | 8 skipped (1674)
```

`pnpm e2e` and `pnpm e2e:ladle` were not run and nothing drags them in: the
commit is one test file, one doc-comment reword in
`packages/persistence/src/repository.ts` and one `AGENTS.md` bullet. No
component, story, canvas module or graph module is touched.

## Comments — review round 1

Two-axis review against `origin/main` with this ticket as the spec source. No
hard standards violation and no scope creep; five things were worth acting on
and all five are fixed in the amended commit.

### The document arm reported the bullet that documents it

The `AGENTS.md` line first landed saying *"Monorepo prose stays writable
anywhere, because the document arm reads shapes rather than the word"*, and the
spec axis falsified it: a capitalised bare word opening a sentence, and a kebab
modifier pnpm could legitimately write, are both reported. Writing the
correction then failed the suite — the sentence naming the two shapes had to
write them.

**The rule was not widened to admit its own documentation.** The bullet was
reworded to describe the reported shapes without spelling either, and it now
says so explicitly. Both seams are recorded in the pattern's doc comment as
deliberate: those shapes are how the retired component, test id, CSS block and
module were written, a false positive fails loudly with a file:line and is one
decision, and a document quietly naming a deleted module is the defect that has
already happened twice. This is the first thing the guard caught, and it caught
it in the document that most needs to be accurate.

### The count was restated wrong

The Comments above said "six bare hits" across the five files while listing
three for `AGENTS.md` — seven. Inherited from this ticket's own "five
exemptions on six total hits" and repeated as measured fact, which is worse than
the original. Corrected in place, with the arithmetic named. The **deciding**
count — 46 Markdown files, zero compound hits — was re-derived independently and
is right.

### The manifest rule was a filename, now it is a path

`basename(file) === 'package.json'` exempted *any* file so named, including a
fixture manifest nested under `packages/**`. It is now anchored at a package
root (`/^packages\/[^/]+\/package\.json$/`), so a nested one is scanned like
every other file. Still a rule, not six paths. Proven: a `package.json` staged
at `packages/app/test/tmpfix/` carrying a `workspace:*` line is reported by
path, where the filename rule let it through.

### The name covered one of the two readings

`RETIRED_CHROME` and "the retired chrome vocabulary" named only the app chrome,
while `CONTEXT.md`'s entry retires the word for the loaded Space as well.
Renamed to `RETIRED_LOOSE_NAME` / `RETIRED_LOOSE_BARE` /
`RETIRED_LOOSE_COMPOUND`, after the glossary's own "used loosely", with the
`describe` reading "the name used loosely for a Space and its chrome is gone".

### Two duplications extracted

Adding a third block made two copies into a pattern, so both are now named once
and all three blocks share them: `scannableFiles()` (tracked files minus the
historical trees, which ADR 0055's block and this one had written out
identically) and `expectEachExemptionEarned(files, pattern)`, which carried the
same six lines and the same comment in two places.

### Left as-is, deliberately

- **The self-test is a sibling `describe`, not folded into the block.** ADR
  0041's block does it this way and ADR 0055's does not; both layouts are in
  the file. Cosmetic, and the sibling reads better here because half of it
  reads the exemption predicate rather than a pattern.
- **The manifest rule earns itself as a rule, not per manifest.**
  `packages/core/package.json` declares no sibling and holds no hit — it is a
  leaf, not a stale exemption — so requiring every manifest to carry one would
  fail on it. The three named modules are still asserted individually.

## Comments — review round 2

`/code-review medium` against `main`. Three findings, all real, all fixed.

### The scope the ticket specified was too narrow — the ticket's own measurement missed it

**Medium, and the most useful thing either review produced.** `packages/**` and
`src/**` is what this ticket says to scan, and it leaves out files issue 08's
rename *actually had to clean*: `vitest.setup.ts` and four under `test/unit/`
(`app-http-startup.test.ts` alone held `createWorkspaceStartup`, a `describe`
naming the composition and an error string). An agent writing
`describe('workspace startup')` back into that file would have kept `pnpm verify`
green while `AGENTS.md` asserted the word "is guarded".

The scan now covers **the source the repo authors** — `packages/**`, `src/**`,
`test/**`, `scripts/**` and the root `.ts` configs. Root tool configuration
(`eslint.config.js`, `.oxlintrc.json`, `.coderabbit.yaml`, `ci.yml`, the two
`pnpm-*.yaml`) stays out by construction: each is written in some tool's
vocabulary and all seven of their hits are pnpm's.

**Widening cost two exemptions, not the ten a whole-tree scan would.**
`scripts/check-typescript-toolchain.ts` (37 hits) and
`test/unit/check-typescript-toolchain.test.ts` (34). Two more files came into
scope and needed no exemption:

- `test/unit/http-server-build-config.test.ts:24` said "resolves every workspace
  alias"; reworded to `@project/*`, exactly as `repository.ts:18` was. Second
  straggler, same treatment, one fewer exemption.
- **This guard's own file.** Its doc comments quoted monorepo prose literally
  ("workspace packages", "a pnpm workspace"), so widening to `test/**` made the
  guard file a hit — the self-hiding failure the file's opening comment warns
  about, arriving from the other direction. The comments were rewritten to
  describe pnpm's prose without spelling it, so the file still holds none of the
  words it bans.

### The manifest exemption forgave the file when only the protocol earns it

**Low.** `packages/*/package.json` was skipped wholesale, so a script named
`"dev:workspace"`, an `imports` entry `"#workspace/*"` or a package renamed
`@project/workspace-ui` would all have passed — and a manifest is exactly where a
module rename surfaces. Forgiveness is now **by line**: `reportableHits` drops
only lines carrying the `"workspace:` protocol, and a manifest is otherwise read
like every other file. The rule is still one rule, not six paths. Proven — a
`"dev:workspace"` script added to `packages/app/package.json` fails the suite.

### The seam list was incomplete

**Low, and the fix is the comment, not the pattern.** The camelCase arm reports
`workspaceAliases` and `workspacePackages`, which are real exported names, so
`docs/agents/build-tooling.md` — the one document whose job is to explain that
alias table — cannot name either symbol. Nothing trips it today. The pattern is
unchanged, deliberately: no document names those two, and an exception without a
live justification is what this ticket warns against. What was wrong was the doc
comment claiming *two* known seams while carrying three. It now names all three
and says why this one is left open.

### Red/green pairs, re-run

| probe | file | result |
|---|---|---|
| `createWorkspaceStartup` | `test/unit/app-http-startup.test.ts` | fails |
| the bare word | `vitest.setup.ts` | fails |
| the bare word | `scripts/ui-catalog.ts` | fails |
| `WorkspaceSidebar` | `packages/app/src/components/SpaceSidebar.tsx` | fails |
| `open-workspace.ts` in prose | `docs/agents/ui.md` | fails |
| `"dev:workspace"` script | `packages/app/package.json` | fails |
| "A pnpm workspace with strict TypeScript." | `README.md` | **green** |
| the bare word | `eslint.config.js` | **green** (out of scope) |

