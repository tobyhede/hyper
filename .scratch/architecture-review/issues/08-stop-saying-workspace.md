# Stop saying workspace

Status: resolved

Surfaced by: the 2026-08-21 architecture review's grilling loop on issue 07,
which needed a name for a new composition module and found that every obvious one
was a term `CONTEXT.md` avoids. Issue 07 deliberately adds nothing to this debt;
it does not close it either.

Blocked by: Issue 07, and anything else structural that is in flight.
`docs/agents/workflow.md` — a repo-wide rename "conflicts with everything, so it
should run alone, and early", and "every ticket completed before it adds new
surface in the old vocabulary". This is the ticket that waits for a gap, not one
that rides along with work.

## The defect

`CONTEXT.md` lists **workspace** under Space's `_Avoid_`:

> workspace (used loosely for the loaded Space and for the app chrome around it —
> say Space, or Sidebar/canvas for the chrome)

Both flagged readings are in the code, and the glossary entry is already correct
— this is a code-follows-glossary rename, not a modelling question. Nothing about
`CONTEXT.md` changes.

**Footprint**, by area:

| Area | Occurrences |
|---|---|
| `packages/app/src` | 79, across 15 files |
| `packages/app/test` | 119 |
| `packages/app/stories` | 50 |
| `packages/app/e2e` | 19 |
| `packages/ui/src` | 6 |
| `docs/` | 24 |

**Reading one — the loaded Space.** `openStoredWorkspace` and
`openImportedWorkspace` (`open-workspace.ts:19, 39`) return an `OpenedSpace`;
`createWorkspaceStartup`/`WorkspaceStartup` (`space.ts:8, 15`) list and open
Spaces; `mountWorkspace` (`Workspace.tsx:41`) mounts one per opened Space. The
clearest case is `space.ts:20`, which throws **"The persistence service returned
no database workspaces."** — those are Spaces, and the sentence reaches a person.

**Reading two — the app chrome.** `WorkspaceSidebar`, `WorkspaceSelection`,
`WorkspaceFailure`/`WorkspaceFailureView`, and the `workspace-selection` and
`workspace-sidebar` class and test-id families. The glossary's answer for these
is Sidebar or canvas.

**Test ids and class names are part of the rename.** `workspace-sidebar`,
`workspace-title` and `workspace-failure` are read by `packages/app/e2e` and by
`packages/app/ladle-e2e`, so the sweep crosses both Playwright suites and ADR
0052's parity evidence.

## The boundary — do not over-apply

**pnpm's workspace is not this word.** `pnpm-workspace.yaml`, the 14
`"workspace:"` protocol entries in the manifests, and every reference to
"workspace packages" in `AGENTS.md` are npm-ecosystem vocabulary for a monorepo.
They stay exactly as they are. A rename that touches them breaks installs and
misreads the glossary, which is about the domain.

**Accepted ADRs are immutable.** ADR 0053 is titled "the workspace command
surface is a sidebar and the canvas takes one choice" and several others use the
word in prose. None of them is edited. `docs/agents/*.md` and `README.md` are
derived current-state documents and do change.

## What to build

1. `AGENTS.md` gains a gotcha line recording the divergence — the glossary says
   Space and Sidebar, the code says workspace, and this ticket closes it. This
   half can land immediately and alone; it is a note, not a rename, and its
   purpose is to stop the next session "fixing" `WorkspaceSidebar` piecemeal.
   `CLAUDE.md` is a symlink to `AGENTS.md`, so that is one edit.
2. The rename itself, in one commit that does nothing else, once a gap opens.
   Decide the two target vocabularies first — what an opened Space's composition
   and startup are called, and what the chrome is called — since `Sidebar` is
   already taken by the `@project/ui` registry component the app composes.
3. `docs/agents/*.md` and `README.md` follow in the same commit.

## Acceptance criteria

- [ ] `AGENTS.md` records the divergence, or — if the rename itself lands — the gotcha is not added at all.
- [ ] No identifier, class name, test id or user-facing string in `packages/{app,ui}` says workspace for the loaded Space or for the app chrome.
- [ ] `pnpm-workspace.yaml`, the `workspace:` protocol entries and monorepo prose are untouched.
- [ ] No accepted ADR is edited.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with real output quoted, and both Playwright suites are **green and unchanged** apart from the renamed selectors.

## Decided — do not re-open

- **The glossary is not the thing that changes.** `CONTEXT.md`'s `_Avoid_` entry
  already says what the words should be. This ticket exists because the code
  disagrees with it, not because the model is unsettled.
- **It does not ride along with anything.** Issue 07 chose `composeApp`
  specifically so a structural change would not have to pick a side in this
  rename, and `docs/agents/workflow.md` forbids the combination outright.

## Comments

**2026-08-22 — resolved.** The rename landed in one commit off `main` at `76b8f70`,
with issue 07's `composeApp` (`ae430f0`) already in.

Two target vocabularies, decided before the sweep:

- **The loaded Space's composition and startup say Space.** `open-space.ts` with
  `openStoredSpace`/`openImportedSpace`, `SpaceStartup`/`createSpaceStartup`, and
  `SpaceApp.tsx` with `mountSpaceApp`, `SpaceAppRenderer`, `SpaceAppFailure` and
  `SpaceAppFailureView`. `SpaceApp` rather than a bare `Space` because the error
  boundary reports *the application around one opened Space* failing to render,
  and `SpaceFailure` would read as "the Space is broken". The chain now reads
  compose (`compose-app.ts`) -> create (`App.tsx`) -> mount (`SpaceApp.tsx`) ->
  start (`startup.tsx`).
- **The app chrome says Space plus the `@project/ui` `Sidebar` it composes.**
  `SpaceSidebar` (prop `spaceTitle`, test ids `space-sidebar`/`space-title`) and
  `SpaceSelection` with the `.space-selection` CSS block. Where the qualifier
  added nothing, prose says just "the Sidebar".

Test ids (`space-sidebar`, `space-title`, `space-app-failure`,
`space-canvas-stand-in`), the `space-selection` CSS block and its
`design-system-inventory.ts` entry, the Ladle story ids
(`components--space-sidebar--*`, `components--operational-feedback--space-app`)
and the parity-claim id `operational-feedback-space-app-failure` all moved with
their subjects.

**The AGENTS.md gotcha from step 1 was deliberately not added.** The acceptance
criterion allows either the note or the rename, and the rename landed — a gotcha
warning against a divergence that no longer exists would be new stale prose.

Two things the ticket's footprint table did not count, both needed for `verify`
to pass: `.oxlintrc.json`'s anti-slop exception paths name
`packages/app/src/{Workspace,WorkspaceSelection,open-workspace}` by file, and
`test/unit/{app-http-startup,current-domain-vocabulary,e2e-http-runtime}.test.ts`
reach the renamed identifiers and the reworded startup error from the root test
tree. Prose in `src/startup/database-startup.ts`, `vitest.setup.ts` and
`.gitignore` used the word in the loaded-Space sense and was swept too.

Deliberately untouched: `pnpm-workspace.yaml`, every `workspace:` protocol entry,
`packages/app/workspace-aliases.ts`, `CONTEXT.md`'s glossary, every
`docs/adr/*.md`, and `docs/superpowers/`.

Verification: `pnpm verify` green (151 test files, 1649 passed / 8 skipped),
`pnpm e2e` 115 passed, `pnpm e2e:ladle` 38 passed.

**2026-08-22 — review round on `1b41623`.** A two-axis review (standards and
spec) found **no missing requirement and no boundary breach**: every acceptance
criterion holds, and `pnpm-workspace.yaml`, the `workspace:` protocol entries,
`packages/app/workspace-aliases.ts`, `CONTEXT.md` and `docs/adr/*.md` are all
untouched. It found twelve wording and test-id defects, applied here and amended
into the same commit:

- **The startup throw's "database" pairing, restored.** `space.ts:20` now reads
  "The persistence service returned no **database** spaces." The minimal swap had
  been `workspaces` -> `spaces`, which dropped the word that paired it with the
  sibling throw four lines below — "The database catalog changed unexpectedly."
  `test/unit/app-http-startup.test.ts` asserts the string and moved with it.
- **`space-app-render` removed from `@project/ui` — a layering fix.**
  `StatusPanel.tsx`'s doc comment named an `app` module (`SpaceApp`) from a
  package that depends on `core` only; it now says "a startup, render or
  placement failure", which is what the generic word it replaced already meant.
- **Five doc comments that read wrong** because a Space does not have commands,
  stay usable, or work: `AppShell.tsx` (the Sidebar belongs to the application,
  not to a Space; a *canvas* stays usable through a notice condition),
  `edge-authoring-react.tsx:497` and `PersistenceControl.tsx:71` (canvas),
  `SpaceApp.tsx:28` (a refused remote snapshot leaves *everything on screen*
  still working), plus `e2e/mobile-sidebar.spec.ts`, `vitest.setup.ts` and
  `packages/app/test/edge-authoring-react.test.tsx`'s local `spaceChrome` ->
  `appChrome`, all of which meant the app's chrome.
- **The `ui` Sidebar test given a neutral test id.** `packages/ui/test/Sidebar.test.tsx`
  passed `space-sidebar` — the app's real production test id — through an
  arbitrary `data-testid` prop. The reusable package should not assert on
  app-specific glue, so it is now `sidebar-under-test`.
- **The `ui-catalog` synthetic fixture given a neutral word.**
  `test/unit/ui-catalog.test.ts`'s "rejects a stable story whose title disagrees
  with its directory" built `surfaces/workspace.stories.tsx` titled
  `Review/Workspace`; it is now `surfaces/canvas.stories.tsx` titled
  `Review/Canvas`. The test proves the same thing — the title's first segment
  still disagrees with `surfaces/` — and this clears the last stray "workspace"
  in the tree that is not the pnpm/monorepo sense.

**Deferred to a follow-up:** a vocabulary guard for "workspace" in
`test/unit/current-domain-vocabulary.test.ts`, which would stop the word coming
back. It was considered and left out on purpose — this ticket requires one commit
that does nothing else, and a new guard is new surface, not a rename.

**2026-08-22 — third review round, on `e9f235a`.** An independent pass over
`main...HEAD` confirmed the change is a rename and nothing more — a word-level
diff of every source and test file leaves only prose words, the two test-fixture
renames and Prettier reflow; no condition, guard, control flow or signature
changed. It found two more defects, applied here:

- **`docs/agents/ui.md:10` contradicted the module it documents.** The derived
  doc had been swept to "a blocking **space-app-render** or placement failure"
  while `packages/ui/src/StatusPanel.tsx` went the other way in the same commit,
  dropping the app-layer name because `SpaceApp` is a `packages/app` module and
  `ui` depends on `core` only. An agent reading the doc before touching
  `packages/ui` would have been pointed back at the layering violation the
  previous round had just removed. It now mirrors the code: "a blocking startup,
  render or placement failure".
- **`packages/app/test/SpaceSidebar.test.tsx:117` had stopped distinguishing the
  rename.** `toHaveTextContent('Space')` is a substring match against a fixture
  titled `'Space'`, so it would have passed against the old `'Workspace'` just as
  well. Anchored to `/^Space$/`.

**A flake worth knowing about, not a defect.** One full `pnpm e2e` run came back
113 passed / 2 failed — a handle-opacity check (`editing.spec.ts:486`) and the
graph legend's item count (`overview.spec.ts:157`), both 5s timeouts in a run
that took 5.2m against a 56s baseline. Neither test touches what that round
changed (a markdown file and a Vitest regex); both passed in isolation at 7.0s
and 10.2s, and the clean full re-run was green at normal duration. The laptop
config runs `retries: 0`, so a loaded machine gives no second signal — under CI's
`retries: 2` these would have reported as flaky rather than failed.

Final verification on the amended commit: `pnpm verify` green (151 test files,
1649 passed / 8 skipped), `pnpm e2e` 115 passed, `pnpm e2e:ladle` 38 passed.

Landed as PR #115 (`refactor/stop-saying-workspace`).
