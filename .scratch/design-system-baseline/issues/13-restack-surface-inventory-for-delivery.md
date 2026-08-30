# 13 — Restack surface inventory for delivery

**Mission:** Deliver the accepted end state assembled on
`feat/surface-inventory` as bounded production migrations from clean bases. The
donor is design and implementation evidence, not a branch to merge. Each target
issue owns one extraction: recover its complete settled production boundary,
reconstruct its accepted design in stable stories, convert production to that
reference, prove parity, merge, then repeat.

**How to prompt an implementing agent:** Supply this issue for the shared
extraction contract and the target issue (for example Issue 02) for functional
scope and acceptance criteria. The agent must read both before changing code.

**Blocked by:** None.

**Status:** resolved
Tags: release/v1

## Answer

The bounded delivery issues in the ownership map have landed or carry their own
explicit remaining owner. This coordination mission no longer represents live
product work and must not remain on the V1 frontier.

## The big picture

`feat/surface-inventory` explored the design system across the application in
one integrated branch. That made cross-surface decisions visible, but its mixed
commits and accumulated dependencies are not reviewable delivery units. Issue
13 freezes that branch as the **donor** and restacks the result into Issues
02–08 and 10.

A target issue is therefore both a feature ticket and an extraction boundary.
Its implementation is complete only when the clean branch has the donor's
settled behavior for that boundary, including the supporting design-system
components, production composition, styles, tests, stories, dependencies and
tooling that behavior actually requires. Copying the named component alone is
not extraction. Replacing a settled donor interaction with a locally plausible
alternative is not parity.

The donor records evidence rather than absolute instructions. Later accepted
ADRs, merged prerequisite issues and the target issue's acceptance criteria may
require reconciliation. Current production has the same status: it is evidence
of product requirements and regressions, not a design authority. Recover the
accepted intent, then express it through the design system. Every donor change
in scope must end as **retained**, **deferred to a named owner**, or **rejected
with a reason**.

## Story-first authority

A stable story is the reviewed reference implementation for its surface. Build
the story first from shared shadcn/Base UI components, fixture data and the
smallest coherent state boundary needed to exercise the design. Validate the
primitive's native composition, keyboard, focus, dismissal, accessibility and
state behavior in Ladle before changing production.

Production parity is directional: convert production to the accepted story,
then prove the same behavior through the real application. Importing an
unreviewed production composite into a story only reproduces its mistakes and
is not parity evidence. After production has been reconciled, the stable story
must consume the same exported component or composition so the two cannot
drift. This final shared dependency does not reverse the order of authority:
the story contract was established first, and production was changed to meet
it.

Use donor and current-production behavior to identify product requirements,
not to preserve implementation accidents. Prefer the design-system primitive's
documented behavior. When an accepted product requirement differs, express it
through the primitive's supported API where possible and record the requirement
and behavior test. A hand-written replacement state machine is a deviation and
must clear the repository's deviation rule.

Ladle renders stories in its catalogue document by default. A modal story must
use Ladle's documented `Story.meta = { iframed: true }` isolation so its focus
trap and inert boundary remain inside the story canvas rather than capturing
the catalogue navigation. Portalled primitives must also resolve their portal
container from the rendered content's `ownerDocument`; a portal that defaults to
the outer document defeats Ladle's iframe. Prove isolation by clicking real
catalogue navigation while the modal is open, not by programmatically filling a
control. Preview mode disables the iframe, so focused Ladle behavior tests still
exercise the component directly. Solve catalogue hosting at the story and
portal boundaries; do not invent a product dismissal action for Ladle.

## Extraction loop

Run this loop for every target issue.

### 1. Establish the boundary

Read this issue, the target issue, its blockers, the accepted ADRs it reaches
and the relevant scoped agent guidance. Start from `main` or the target's
declared immediate predecessor.

**Complete when:** the branch base and governing decisions are named, and no
unresolved blocker changes the target's acceptance criteria.

### 2. Inventory the donor end state

Compare the clean branch with the donor's final tree and inspect the commits
listed under **Donor accounting**. Trace the complete production boundary from
the target surface through:

- shared primitives and public exports;
- production state translation and composition;
- tokens, styles and dependencies;
- component, application and E2E tests;
- stable stories, story fixtures and Ladle behavior tests;
- catalogue, configuration or tooling changes required by those artifacts.

Use the final donor usages as evidence, not filenames alone. A primitive added
in a foundation commit belongs to the production migration that needs it when
the foundation PR did not deliver it. Mixed commits are hunk sources, not
ownership decisions.

**Complete when:** every donor path and behavior touching the target boundary
is listed as retained, deferred to a specific issue, or rejected with a reason.

### 3. Reconcile and implement

Reconcile vertically, story first:

1. Write one stable story state or interaction from shared design-system
   components and fixture inputs.
2. Add its Ladle behavior test and observe it fail for the missing or incorrect
   contract.
3. Make the story correct against the primitive and accepted product
   requirement.
4. Convert the production boundary to the accepted component or composition.
5. Add or update the corresponding application behavior test.
6. Repeat for the next meaningful state or interaction.

Keep the target issue's functional scope and transitive UI boundary. When donor
behavior and current code differ, determine which product requirement each was
trying to serve and whether either implementation contradicts the design
system. Record intentional departures in the target issue before treating them
as complete.

Fixtures may supply public inputs and environment. They do not inherit state
translation, lifecycle, focus or interaction from unreviewed production code.
Once production is reconciled, promote the accepted composition to the shared
export both production and the stable story consume (ADR 0052).

**Complete when:** every stable-story contract was established and proven before
its production conversion, both surfaces consume the reconciled export, and
every intentional primitive or donor departure has a documented authority.

### 4. Prove parity on the extracted branch

Verify the branch in its final shape; green results inherited from the donor do
not count. Run the repository-required checks plus the target issue's focused
component, application, Ladle and E2E coverage. Inspect the rendered stable
states named by the target rather than relying on compilation alone.

**Complete when:** every target acceptance criterion has production evidence,
every stable-story claim maps to both its Ladle behavior proof and its real
application behavior proof, and all required checks pass without flaky retries.

### 5. Close the accounting

Update the target issue with the retained donor commits/hunks, reconciliations,
deferred owners, rejected work and real verification output. Merge the bounded
PR before beginning a dependent extraction. Keep the donor until the final
donor-to-landed audit finds no unowned retained work.

**Complete when:** a reviewer can account for the target's complete donor
boundary from the issue record without reconstructing the extraction.

## Ownership map

The target issue owns behavior; these notes identify the expected donor seam.
They supplement rather than replace each target's acceptance criteria.

- **Issue 02 — workspace toolbar:** View/Layout/Graph selectors, Add Card integration,
  Present/Overview and the complete persistence composition. On the donor that
  includes `PersistenceIndicator`, conflict and permanent-rejection
  `AlertDialog` surfaces, nested `Alert` detail, their exports, tests and real
  production stories. A toolbar-only substitute is not parity. **Delivered, and
  its surface is superseded by Issue 14** — the behaviour above still has to
  exist and still has to be proven; it is now proven in a Sidebar.
- **Issue 14 — workspace Sidebar:** not a donor extraction. ADR 0053 moves the
  command surface out of the header row and makes the canvas choice one
  exclusive list over computed Views and authored Layouts. Its retained input is
  Issue 02's settled behaviour carried across unchanged; the donor contributes
  nothing to it.
- **Issue 03 — Card and Alias panes:** form/dialog composition, atomic edit,
  validation, focus, long-content and target-picker states. Card-choice model
  consolidation remains Issue 10.
- **Issue 04 — Space startup and operational feedback:** common operational
  feedback not already owned by Issue 02's persistence composition. Its donor
  chooser-state scope is superseded by ADR 0058 (2026-08-20): `WorkspaceSelection`
  is deleted rather than designed, so no donor hunk for a Space chooser is
  retained here.
- **Issue 05 — Canvas Card:** the production React Flow Card's visual and
  control surface while adapter-owned geometry and gestures remain intact.
- **Issue 06 — Graph HUD and Edge authoring:** legend, minimap framing,
  selected-Edge controls, endpoint editing, refusal and reconnection states.
- **Issue 07 — presentation chrome:** production traversal choices, keyboard
  guidance, end state and Overview exit; the donor has no coherent completed
  implementation, so implement the accepted ticket rather than incidental
  styles.
- **Issue 10 — Card choice:** one behavior model with collapsed and inline
  presentations; remove the donor's lasting third implementation.
- **Issue 08 — final parity and guardrails:** complete catalogue coverage,
  traceability, runtime validation, boundary enforcement and required Ladle CI
  after production migrations land.

When a shared primitive serves several issues, its first production owner may
deliver it with its complete tests and exports; later issues consume it. Record
that ownership once rather than splitting an indivisible primitive or copying
it between PRs.

## Delivery order and progress

1. Issue 12 fixed the full-suite startup race through PR #72.
2. Issue 09 removed shared Card Description through PR #73.
3. Issue 01 delivered the design-system foundation through PR #74.
4. Issue 11 extracts ADR 0052 with static Ladle runtime, taxonomy and catalogue
   baseline.
5. Deliver Issues 02–07 as bounded production migrations in dependency order.
6. Deliver Issue 14 after Issue 02, replacing the surface Issue 02 delivered.
7. Deliver Issue 10 after Issue 03 establishes its pane composition.
8. Deliver Issue 08 last with the complete parity and enforcement gate.

This order coordinates extraction. Functional acceptance and `Blocked by`
relationships remain authoritative in the target issues.

## Preserved work

Issue 02's partial Menubar migration is stored at
`../patches/issue-02-workspace-menubar-wip.patch`. Its source was stash object
`2814ec7c5b135ba1fe5a07d9f472a66c8634d9fe`, named
`wip issue 02 workspace menubar migration`. It targets the donor's later
surface: use it alongside the donor inventory, not as a complete Issue 02
implementation.

Keep `feat/surface-inventory` until final accounting proves no retained work
exists solely on the donor. The patch makes the partial Menubar work available
from clean branches; the stash object is historical evidence only.

**That patch is now dead in both directions and must not be applied.** The
Menubar it migrates *to* was withdrawn on 2026-08-18, and the header row it
migrates *within* is withdrawn by ADR 0053. It stays tracked as donor evidence
for the final audit and for nothing else.

## Donor accounting

The commits below locate evidence. Extract retained hunks; do not treat commit
boundaries as delivery boundaries.

### Clean issue branches

- **Issue 12:** no donor implementation commit; the donor contributes audit
  evidence only.
- **Issue 09:** reconstruct from `main` under ADR 0051. `6bac404` contains the
  superseded title-only intermediate state and is evidence, not a commit to
  pick.

### Design-system foundation

- `cbc2000` establishes shared primitives, Tailwind baseline and tickets.
- `933e35e` completes baseline tokens and shared-component integration.
- `f560750` adds the mandatory shadcn-first workflow and pinned skill.
- Foundation hunks of `6292d9e` and `b45eba5` retain configuration, lock,
  primitive and guardrail corrections.
- Foundation ownership covers `.agents/skills/shadcn*`,
  `.claude/skills/shadcn*`, `.codex/config.toml`, `skills-lock.json`, baseline
  Tailwind ownership and import restrictions. Primitives absent from the
  delivered foundation travel with their first production owner.

### Ladle infrastructure

- Infrastructure hunks of `89e4680`, `0321220` and `725c992` provide static
  runtime, Vite/Ladle configuration and story taxonomy.
- `4b231cf` removes unsupported proposal stories and live-fixture assumptions.
- Independent catalogue/configuration corrections from `f325fc9`, `6292d9e`
  and `b45eba5` belong here. Stable component stories travel with their
  production owner unless Issue 08 explicitly owns their final parity work.

### Production migrations

- **Issue 02:** `90f87ee`, the tracked WIP patch, and final donor production
  usages needed by the ownership map above.
- **Issue 03:** `f570a1c`, `50105ad`, `b2895d6`, `a139caa`, plus pane/focus
  corrections in `6292d9e` and `b45eba5`.
- **Issue 04:** `d8520b6` and workspace-chooser corrections in `6292d9e`.
- **Issue 05:** `099241a`, `de6eca5`, `6664421`, `f325fc9`, `6bac404`,
  `267708e`, plus Canvas corrections from `6292d9e` and `b45eba5`; reconcile
  the final result with ADR 0051.
- **Issue 06:** Graph/handle hunks of `de6eca5`, `933e35e` and later review
  corrections; focused production stories and dual evidence remain new work.
- **Issue 07:** no coherent donor implementation commit.
- **Issue 10:** `9833d29` and the `50105ad` Card-choice work, reconciled to the
  accepted two-presentation architecture.

### Final parity delivery

- **Issue 08:** remaining stable stories and Ladle tests from `725c992` through
  `b45eba5`, plus the new parity inventory, dual-evidence enforcement, runtime
  collection validation, no-green-flakes reporting and required CI job.

## Explicitly rejected donor work

- The original `89e4680` `CardFace`, `StaticCanvas`, story-local Toolbar and
  inventory facsimiles; later work replaced them and ADR 0052 excludes them
  from stable evidence.
- Proposal-only Card, Graph and theme stories introduced by `725c992` and
  removed by `4b231cf`.
- `6bac404`'s orphaned Description state; Issue 09 removes the field.
- `50105ad`'s third Card-choice implementation as a lasting public model; Issue
  10 restores one behavior with two presentations.
- Story-only state translation, manufactured interaction controls and fake
  React Flow geometry. Stable stories use the real production boundary.

Before resolving Issue 13, record the final PR links and retained commits, then
audit every path in `main...feat/surface-inventory` to a landed owner or one of
the explicit rejections above.
