# 08 — Complete the Ladle catalogue and enforce design-system guardrails

**What to build:** Make Ladle a trustworthy catalogue of the real UI, then enforce the boundary that product components and styles come through the design system while React Flow retains only its necessary geometry and integration styling.

**Blocked by:** 03 — Recompose Card and Alias panes from form primitives; 04 — Bring workspace selection and operational feedback into the system; 05 — Make the production canvas Card a design-system component; 06 — Systematise Graph HUD and Edge authoring surfaces; 07 — Rebuild presentation chrome with design-system components; 11 — Deliver ADR 0052 and its production-parity operating rule to `main`; 14 — Replace the workspace toolbar with a workspace Sidebar. Issue 14 supersedes resolved Issue 02's withdrawn Menubar and interim selector designs.

**Status:** ready-for-human — the enforcement is delivered and two acceptance lines are honestly short. See "What is not ticked, and why" in the 2026-08-21 comment; whether to accept the residual or open follow-ups is the call being handed over.

- [ ] Every production UI component has representative real-component Ladle stories for its meaningful states; no proposal-only story is presented as production evidence. — **Half.** *Coverage* is enforced: every production `.tsx` is either rendered by a stable story or recorded with a reason, and `stories/review` is excluded so a proposal cannot supply evidence. *Meaningful states* is not, and cannot be mechanically: it is the same judgement the Answer already leaves with human review for the claim set's semantic completeness.
- [ ] Legacy feature-owned visual styling is removed or explicitly limited to React Flow geometry and integration requirements. — **Half.** Seven dead rules are gone and every surviving block is recorded with its reason, so the file is a reviewed list rather than a claim. But two blocks are neither removed nor React Flow's: `card-editor` is product appearance ([Issue 16](16-move-the-card-editor-treatment-into-the-design-system.md)) and `workspace-selection` is condemned with its component (`space-cards/04`). Recording a reason is a third option this criterion does not offer.
- [x] Automated checks prevent new product UI components or styles from bypassing `@project/ui`, and the complete verification suite remains green. — Ticked where the two above are not, and the distinction is deliberate: this line asks the check to *stop a bypass going unnoticed*, which recording-with-a-reason does, since the reason is written, reviewed and fails when it stops being true. The line above asks the styling to be *gone or limited to React Flow*, which a reason cannot satisfy.
- [x] `$shadcn-first-ui` exists and is the mandatory production-UI workflow.
- [x] Root `AGENTS.md` routes production UI work to that skill near the beginning of the file.
- [x] `pnpm ui:catalog` deterministically exposes the public design-system inventory.
- [x] `pnpm ui:catalog:check` is part of verification.
- [x] Codex has project-scoped access to the official shadcn MCP server.
- [x] App and React Flow adapter code cannot import Base UI, cmdk, Lucide, or `@project/ui` internals directly.
- [x] `stories/components` contains only real production components.
- [x] `stories/surfaces` contains real production compositions.
- [x] `stories/review` is the only home for proposal-only UI.
- [x] `stories/support` contains no product visual facsimiles.
- [x] A custom replacement for existing shadcn/Base UI behavior requires an explicit documented deviation.
- [x] Every meaningful stable-story claim is verified both through the rendered Ladle story and through the real application composition (ADR 0052).
- [x] A deterministic parity inventory maps every meaningful stable-story claim to both its Ladle behavior test and its corresponding application behavior test, and `pnpm ui:catalog:check` rejects missing or stale mappings (ADR 0052).
- [x] `pnpm ui:catalog` prints the resolved story, claim, Ladle evidence and application evidence matrix for review.
- [x] Each Playwright suite validates at runtime that every expected parity test was collected once and passed without a flaky retry.
- [ ] **Delegated to [Issue 15](15-run-the-ladle-parity-suite-in-ci.md); not this ticket's to build.** Ladle E2E runs as its own required CI job, and CI fails when any Playwright test is flaky even if a diagnostic retry passes. — The job landed in PR #83 and the flake policy is settled; what remains is the branch-protection rule that makes it *required*, which is a GitHub setting rather than a file. Close this line against Issue 15's Answer, not against work here. See the Comments below.

## Audit note

`ui:catalog:check` currently proves public-export reachability and story
taxonomy. It does not prove that every meaningful production state has a story
or detect a product visual facsimile under `stories/support`; the missing states
recorded in issues 02–07 pass it today. Close this ticket only when those limits
and ADR 0052's dual-verification traceability are enforced by the deterministic
parity inventory. ADR 0052 owns the durable production-parity rule and rationale;
this ticket owns its implementation and enforcement.

## Answer

Parity is inventoried as explicit named behavioral claims rather than story
files or exports alone. A meaningful claim is any product-significant state,
semantic, geometry, accessibility contract or interaction that justifies a
stable story's presence. Every named export under `stories/components` and
`stories/surfaces` must have at least one claim; `stories/review` is excluded.

The checked-in source of truth is a literal TypeScript manifest. Each row holds
a stable semantic kebab-case claim id, a story file and named export, and a
concise human-readable claim. It contains no helpers or derived entries. Tests
refer to claims through literal native Playwright tags of the form
`@parity:<claim-id>`. Each claim has exactly one tagged Ladle test and exactly
one tagged application test; one test may carry several tags when it genuinely
proves several claims.

Enforcement has two layers. `pnpm ui:catalog:check` enumerates stable story
exports, validates every manifest story reference, requires a non-empty claim
set per export, rejects duplicate or unknown claim ids and tags, and rejects
missing, stale, review-only or obviously excluded evidence. `pnpm ui:catalog`
prints the resolved matrix. Human review remains responsible for whether the
declared claim set is semantically complete.

Each Playwright suite also validates at runtime that every expected tagged
logical test was collected once and passed. Skipped, excluded and flaky tests
are not evidence. Retries may remain to gather diagnostics, but CI fails if any
Playwright test needed one. This is repository-wide rather than parity-only.

`pnpm verify` retains the static gate. Application and Ladle E2E remain separate
runtime commands, with Ladle E2E added as its own parallel required CI job. The
manifest, complete evidence backfill, static checker, runtime validation and CI
job land coherently: there is no grandfather list. A stable state without both
proofs moves to `review` or is removed.

## Comments

### 2026-08-21 — the two gaps become a checked inventory

The audit note's two limits are closed by one mechanism rather than two.
`packages/app/stories/design-system-inventory.ts` declares two literal lists
beside `parity-claims.ts`, and `pnpm ui:catalog:check` holds both to the tree.

**`uncataloguedComponents`** names every production `.tsx` under
`packages/{ui,app,react-flow-adapter}/src` that no stable story renders.
Reachability is resolved through the real import graph from `stories/components`
and `stories/surfaces` — `stories/review` is excluded, so a proposal cannot
catalogue anything — following relative paths, `packages/app/package.json`'s own
`#components/*` subpath map, and `@project/*` barrels *by the names taken through
them*. That last part is what makes it bite: following a barrel whole would have
marked all of `@project/ui` catalogued the moment one story imported `Button`.

**`handRolledStyles`** names every block `packages/app/src/styles.css` still
declares — by class, or, for a rule that names no class at all, by its leading
attribute, id or element — with the React Flow or integration requirement that keeps it
out of `@project/ui`. Both lists fail in both directions — a new component or
block fails until it is built from the design system or recorded with a reason,
and an entry that stops being true fails too.

The check also rejects a rule no production module names, which found seven dead
ones: `.btn`, `.btn--primary`, `.controls__btn`, `.controls__btn--exit`,
`.persistence-refusal`, `.rf-edge--reference` and `.card-pane__field--source`,
all deleted. One of them was being kept alive by a test *about* it —
`ui-theme-contrast.test.ts` asserted `.btn--primary` used the semantic token, so
the only thing referencing that rule was the assertion; it now asks `Button`'s
own `default` variant instead. Two facsimile rules went from
`stories/support/inventory.css` the same way: `.inv-canvas`, the paper canvas,
and `.inv-app-surface`, which existed for the condemned Space chooser.

**A real defect fell out of the style audit.** `.card--full .card__title` sat
*after* the `.rf-card-node__content` container-query block at equal specificity,
so a presented Card's title drew at a fixed `1.3rem` rather than scaling with its
frame — precisely what the block's own comment and ADR 0027 forbid. The two
`.card--full` rules moved above it, and `presenting.spec.ts` now pins the
computed `13px` (5cqw of the 260px frame) so source order cannot drift back.

**One missing production story was backfilled.** `NewAlias` — the pane that
authors an Alias that does not exist yet — had no stable story, only the *opened*
Alias did. `Components/Card and Alias Panes → NewAliasPane` renders the
production component, and the claim
`new-alias-completes-on-the-target-chosen` carries a Ladle proof and a real
application proof in `editing.spec.ts`. Adding it also removed
`packages/ui/src/components/input.tsx` from the uncatalogued list, which is the
check working in the other direction.

**What is not ticked, and why.** Two acceptance lines are half-met, and are left
unticked rather than argued into place.

*"…for its meaningful states"* — the check proves a production component is
**rendered** by a stable story, not that the story shows its meaningful states.
No mechanical check can decide the second, which is why the Answer above already
leaves the claim set's semantic completeness with human review; the same
judgement governs states. What changed is that the gap is now enumerated and
dated rather than invisible, and the Audit note's other limit — detecting a
product visual facsimile under `stories/support` — is fully closed.

*"…removed or explicitly limited to React Flow geometry and integration
requirements"* — every surviving block now carries its reason, but two of them
are not React Flow's and are not removed. `card-editor` is product appearance:
hard-coded ink, paper and rule colours, the largest thing left in `styles.css`.
It now has an owner, [Issue 16](16-move-the-card-editor-treatment-into-the-design-system.md),
rather than sitting in the inventory as debt with none. `workspace-selection` is
condemned with its component under ADR 0058 and goes with `space-cards/04`.
Recording a reason is a third option the criterion does not offer, so the box
stays open until those two land.

`AuthorableEdge` and `RoutedEdge` are a third recorded gap with an owner already:
their review story carries no parity claim because promoting it is blocked on the
reconnected-Edge selection defect at
`findings/reconnected-edge-loses-its-selection.md`.

**One thing here was not asked for.** The `.card--full` cascade fix and its
`presenting.spec.ts` assertion are a rendering change, and no acceptance line
reaches them. They are kept because the style audit this ticket *did* ask for is
what surfaced the defect, and recording the block in the inventory without fixing
it would have documented a broken cascade as intentional.

### 2026-08-21 — what a three-source review changed

Three independent reviews ran over the branch — the two-axis Standards/Spec pass,
a correctness pass over the new static analysis, and CodeRabbit. Every finding
was re-derived against the code before being trusted; the checker was wrong in
ways worth recording, because each one is a way a guardrail can look green while
checking nothing.

**Four holes let a check pass when it should have failed.** `#` subpath
specifiers all resolved under `packages/app`, so `packages/ui`'s own
`#components/*` map was ignored and `sheet`, `skeleton` and `label` were recorded
as uncatalogued when the Sidebar renders them — the inventory was asserting
something untrue. A re-export alias was read on the wrong side of `as`, so
importing `CardContent` also reached the unrelated module exporting
`CardContent as CardSection`. A `@media` or `@container` block hid every rule
nested inside it from both stylesheet checks. And a whole-namespace import of a
barrel silently catalogued the entire package, defeating the guarantee this
file's own doc comment makes.

**The dead-rule check was reading the wrong thing entirely.** It treated every
string literal in production source as a possible class name, so `.card` was held
"named" by `{ kind: 'card' }` in the render adapter and `type: 'card'` in the
projection — neither a class. Deleting the real `className="card"` would have
left the rule reported as live. It now reads only `className`/`class` attributes,
`className` properties and `cn()`-style calls.

**Two rules had no class to record, so the inventory could not see them at all.**
`[data-card-search-combobox]` — product appearance, part of `card-editor`'s debt
— and `#root`. A rule naming no class is now keyed by its leading attribute or
id, and both are recorded.

**Two entry reasons here were false statements about the tree.** `Command.tsx`
claimed `CardSearchCombobox` composes it; it composes Base UI's `Combobox`
instead. `components/empty.tsx` claimed the combobox empty message came from it;
that is Base UI's `ComboboxEmpty`. Both are consumerless primitives like
`Select`, and now say so. This is the failure the file warns about in its own
header — an entry with neither a permanent reason nor an owner — and it took a
reviewer, not the check, to find it.

**One claim overstated its evidence.** `new-alias-completes-on-the-target-chosen`
said the pane carries "the title exactly as typed", but only the Ladle test types
one; the application test exercises the empty title that takes the Target's own
(ADR 0049). The clause is gone rather than given a second proof it did not have.

Smaller corrections: a default import beside a type-only specifier was treated as
erased; a recorded module outside the scanned set could never come true or false;
duplicate entries collapsed silently; a non-exported local declaration shadowed
the exported list the checker meant to read; `stories/` and `stories/support` had
no missing-directory guard while the other roots did; and colocated tests counted
as production naming a class. `docs/agents/ui.md` also said the Card editor CSS
belongs in `@project/ui`, which pre-decided the choice Issue 16 exists to make —
`CardPane` and `OpenCard` are app-specific glue, and AGENTS.md keeps that in
`app`.

Two findings were examined and rejected. `manifest` is retired as a name for the
space file — `packages/core/src/schema.ts` says exactly that — not as a name for
`package.json`, which `scripts/check-typescript-toolchain.ts` already calls a
manifest on `main`; the claim that this fails `current-domain-vocabulary.test.ts`
is false, since that test governs Route and Walk. And `buildUiCatalog` running
several policies over one `problems` array is a fair Divergent Change reading,
but splitting the design-system gate into three modules is a bigger change than
this ticket should make.

**Verification.** `pnpm verify` green — 149 files, 1638 passed, 8 skipped.
`pnpm e2e` 115 passed. `pnpm e2e:ladle` 38 passed. (An earlier revision of this
line said 1633, which no run had produced — a transposed figure in a verification
claim, which is the one number here that has to be copied rather than recalled.)

### 2026-08-20 — the parity-evidence model lands before the remaining migrations

The literal manifest, resolved catalogue matrix, static exact-one evidence
checks and runtime Playwright collection checks now exist. The current stable
catalogue has nine claims; every one names exactly one Ladle test and exactly
one application test through a literal `@parity:<claim-id>` tag. Both suites
read the same manifest at runtime and fail when an expected claim is missing,
duplicated, skipped, failed or flaky.

This deliberately establishes ADR 0052's live seam before Issues 04–07 add
their stories, so those migrations extend the manifest and both proofs in the
same change instead of leaving Issue 08 a late evidence backfill. There is no
grandfather list.

The first complete scan also found two Issue 03 stories with no honest
application proof: an Alias with no eligible Target, and an Alias whose Target
becomes stale while its editor remains open. The production pane accepts those
inputs, but the current application cannot reach either state. They moved from
`stories/components` to `stories/review` as ADR 0052 requires; their Ladle
behavior tests remain review evidence and carry no parity tag.

Issue 08 remains open. The complete production-state inventory, remaining
story migrations, visual-facsimile/style cleanup and design-system guardrails
still depend on Issues 04–07.

### 2026-08-19 — the CI job moves to Issue 15

The criterion "Ladle E2E runs as its own required CI job" is now owned by
[Issue 15](15-run-the-ladle-parity-suite-in-ci.md), which is blocked by nothing.
This ticket is blocked by 03, 04, 05, 06, 07, 11 and 14 — every one of which is
required to land a stable story and its Ladle behaviour test — so holding the job
here means six tickets' worth of parity evidence accumulates before anything
executes any of it.

What stays here is unchanged: the parity inventory, the `@parity:<id>` tags, the
runtime collection validation, and `ui:catalog:check`'s traceability
enforcement. Issue 15 delivers only the job that runs the suite, so the
"land coherently, no grandfather list" rule above still governs the manifest and
the checker — it just no longer has to wait for a workflow file.

One correction to carry: the retry half of the criterion assumed a diagnostic
retry exists, and when this was written `playwright.ladle.config.ts` set
`retries: 0`, leaving `failOnFlakyTests` nothing to change. Issue 15 has since
settled it — the config now carries `retries: process.env['CI'] ? 2 : 0` and
`failOnFlakyTests: !!process.env['CI']`, which is `playwright.config.ts`
exactly, so both suites run one policy and a diagnostic retry exists for the
criterion to be written in terms of.

Read Issue 15's Answer before relying on that retry for anything: it does not
make a blip survivable. With `failOnFlakyTests` set, a test that fails once and
passes on retry is flaky and a flaky run still exits non-zero. The retry buys
the trace and the reproduce-or-not signal, not tolerance.
