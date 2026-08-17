# 13 — Restack surface inventory for delivery

**What to do:** Freeze `feat/surface-inventory` as a donor branch and restack
the retained work into bounded, reviewable PRs based on `main`. Preserve the
audit and decisions while giving every implementation change one clear owner
and a trustworthy verification gate.

**Blocked by:** None.

**Status:** claimed

- [ ] Commit the audit, ADR and tracker checkpoint before extracting code so the
      donor branch contains the reasoning used to split it.
- [ ] Record the commit and file ranges retained by each extracted PR; every
      production, test, story, tool and dependency change on the donor branch is
      either assigned to one PR or explicitly rejected with a reason.
- [ ] Create each delivery branch from `main` or from its declared immediate
      predecessor, never from the complete donor branch.
- [ ] Keep PRs bounded to one coherent responsibility and independently
      reviewable against their declared base.
- [ ] Run each PR's required verification in its own final shape; inherited
      green evidence from the donor branch does not count.
- [ ] Keep the donor branch until every retained change has landed or has a
      verified owner elsewhere; keep Issue 02's WIP available through its
      tracked patch.
- [ ] Record the final PR links, dependency order, retained commits and rejected
      donor changes in this ticket before resolving it.

## Delivery order

1. Fix issue 12's full-suite startup race independently so later UI gates are
   trustworthy. Diagnostic retries may remain, but flaky results fail CI.
2. Implement issue 09's removal of shared Card Description before extracting
   further Card/editor work.
3. Extract the resolved issue 01 design-system foundation and its tooling
   without production-surface migrations.
4. Extract Issue 11's ADR 0052 decision and operational pointers together with
   the static Ladle runtime, taxonomy and catalogue infrastructure, with only
   production-parity stable stories.
5. Deliver issues 02–07 as bounded production migrations in dependency order.
6. Deliver issue 10 after issue 03 has established the pane composition it
   depends on.
7. Deliver issue 08 last: complete the stable catalogue, backfill both behavior
   proofs for every parity claim, add static and runtime enforcement, and make
   Ladle E2E its own required CI job.

This sequence coordinates delivery; it does not replace the functional
acceptance criteria or `Blocked by` relationships in the referenced tickets.

## Delivery progress

- Issue 12 merged through PR #72.
- Issue 09 merged through PR #73.
- Issue 01 merged through PR #74; this tracker is included there so every
  subsequent clean branch from `main` inherits the remaining tickets and their
  dependency order.
- Issue 11's ADR 0052 decision is extracted on `feat/ladle-production-parity`
  from PR #74's merge commit. Ladle runtime and enforcement files remain
  assigned to Issue 08 rather than riding with the decision record.

## Preserved work

The partial Issue 02 Menubar migration is stored as the tracked patch
`../patches/issue-02-workspace-menubar-wip.patch`. Its source was local stash
object `2814ec7c5b135ba1fe5a07d9f472a66c8634d9fe`, named
`wip issue 02 workspace menubar migration` (`stash@{0}` when created). Inspect
and rework the patch's intent only on Issue 02's eventual delivery branch. It
targets the donor's later surface, so do not assume it applies cleanly to the
files that branch inherits.

Keep `feat/surface-inventory` until final accounting proves no retained work
exists solely on the donor. The tracked patch makes Issue 02's WIP available
from `main`; the local stash object is historical evidence rather than a runtime
dependency.

## Donor accounting

The donor's commits are inputs, not cherry-pick instructions. Several mix
infrastructure, stories and production behavior; extract their retained hunks
onto the declared clean branch and verify that branch independently.

### Clean issue branches from `main`

- **Issue 12 — fixture startup:** no donor implementation commit. Diagnose and
  implement from `main`; the donor contributes only the audit evidence in issue
  12.
- **Issue 09 — retire Description:** reconstruct from `main` under ADR 0051.
  Commit `6bac404` encoded the superseded title-only behavior while leaving the
  field in the schema, so it is evidence rather than an implementation to pick.

### Design-system foundation PR

- `cbc2000` establishes the shared primitives, Tailwind baseline and tickets.
- `933e35e` completes baseline tokens and shared component integration.
- `f560750` adds the mandatory shadcn-first workflow and pinned shadcn skill.
- Foundation portions of `6292d9e` and `b45eba5` retain configuration, lock,
  primitive and guardrail corrections; their production/story hunks remain with
  the owning migrations below.
- Path ownership: `.agents/skills/shadcn*`, `.claude/skills/shadcn*`,
  `.codex/config.toml`, `skills-lock.json`, `packages/ui/src/components/**`,
  baseline `packages/ui` exports/tests, Tailwind ownership and import
  restrictions. A primitive used only by a later migration may land here, but
  no app behavior change may ride with it.

### Ladle infrastructure PR

- Infrastructure portions of `89e4680`, `0321220` and `725c992` provide the
  static runtime, Vite/Ladle configuration and story taxonomy.
- `4b231cf` supplies the final removal of unsupported proposal stories and live
  fixture assumptions.
- Catalogue and configuration corrections from `f325fc9`, `6292d9e` and
  `b45eba5` belong here only when independent of a production component.
- Path ownership: `playwright.ladle.config.ts`, Ladle scripts/configuration,
  `scripts/ui-catalog.ts`, its unit tests and package scripts. Stable component
  stories do not land here unless both ADR 0052 proofs already exist.

### Production migration PRs

- **Issue 02 — workspace toolbar:** `90f87ee` plus the tracked WIP patch at
  `../patches/issue-02-workspace-menubar-wip.patch`, sourced from stash object
  `2814ec7c5b135ba1fe5a07d9f472a66c8634d9fe`; rework rather than blindly apply
  where the donor surface conflicts with the clean branch.
- **Issue 03 — Card and Alias panes:** `f570a1c`, `50105ad`, `b2895d6`,
  `a139caa`, and the pane/focus corrections in `6292d9e` and `b45eba5`.
- **Issue 04 — selection and feedback:** `d8520b6` and the workspace-chooser
  corrections in `6292d9e`; remaining chooser/error work follows issue 04.
- **Issue 05 — production Canvas Card:** `099241a`, `de6eca5`, `6664421`,
  `f325fc9`, `6bac404`, `267708e`, and Canvas corrections from `6292d9e` and
  `b45eba5`. Reconcile these final-state hunks with ADR 0051 rather than
  preserving `6bac404`'s partial Description decision.
- **Issue 06 — Graph HUD and Edge controls:** Graph/handle portions of
  `de6eca5`, `933e35e` and later review corrections; focused production stories
  and dual evidence remain new work.
- **Issue 07 — presentation chrome:** no coherent donor implementation commit;
  implement from the accepted ticket rather than extracting incidental styles.
- **Issue 10 — Card choice:** `9833d29` provides pane sizing evidence and
  `50105ad` introduced `CardSearchCombobox`; retain the behavior requirements,
  but remove the third choice model as issue 10 requires.

### Final parity PR

- **Issue 08:** stable stories and Ladle tests from `725c992` through `b45eba5`
  move only with their owning production component or into this final parity
  completion PR. ADR 0052's parity inventory, dual evidence, runtime validation,
  no-green-flakes reporting and Ladle CI job are new work.

### Explicitly rejected donor work

- The original `89e4680` `CardFace`, `StaticCanvas`, story-local Toolbar and
  inventory facsimiles; later commits removed or replaced them and ADR 0052
  forbids their return.
- Proposal-only Card/Graph/theme stories introduced by `725c992` and removed by
  `4b231cf`; no accepted product state owns them.
- `6bac404`'s orphaned Description state; issue 09 removes the field completely.
- `50105ad`'s third Card-choice implementation as a lasting public model;
  issue 10 restores one behavior with two presentations.
- Any story-only state translation, manufactured interaction control or fake
  React Flow geometry, regardless of which mixed donor commit contains it.

Every path in `main...feat/surface-inventory` falls under one of the path or
commit owners above. Final extraction must record the actual retained commit
for each PR and use a final donor-to-landed diff audit before this ticket is
resolved.
