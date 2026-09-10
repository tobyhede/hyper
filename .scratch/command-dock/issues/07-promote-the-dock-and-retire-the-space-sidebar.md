# 07 — Promote the Dock and retire the Space Sidebar

Status: resolved
Tags: release/v1
Blocked by: nothing. The theme change merged as `a5a76669` (`feat(theme): sand
is the canvas, and the chrome is neutral over it`), so the colour judgements
here stand on the application's own tokens. 01, 02 and 04–06 are closed, and 06
handed this ticket two of its own findings — the parent mark's evidence and the
destructive row's resting ink, both below.
Blocks: `v1-release/03`, `v1-release/05`, `v1-release/06`.

**What to build:** The thing the other six tickets are preparation for. `01`–`06`
all finish with the Dock still a prototype under `stories/review`, nothing in
`packages/app/src` mounting it, and `SpaceSidebar` still the production command
surface. Until that changes, ADR 0082 supersedes ADR 0053 on paper and the
application still draws ADR 0053.

This ticket is where `04`'s seam work and `05`'s wiring are spent. It is not a
cleanup pass — `06` is that — and it is not small.

## What is being replaced

- `packages/app/src/components/SpaceSidebar.tsx` — 965 lines, mounted at
  `App.tsx:859`, taking grouped props (`canvas`, `graph`, `addCard`,
  `createLayout`, `persistence`, `selectedCard`, `entityActions`, `titleEdit`).
  This is the interface `04` tells the prototype's `Chrome` to follow, so by the
  time this ticket runs the two should already be shaped alike.
- `packages/app/src/components/OpenSpaceSidebars.tsx` — 40 lines. One mounted
  `SpaceSidebar` per open Space inside one `collapsible="offcanvas"` root, which
  is where `cmd/ctrl+B`, the remembered open state and the mobile Sheet come
  from.
- `AppShell` (`App.tsx:980`, `:1164`) frames the gutter. ADR 0082 binds that the
  surface **takes no layout space from the canvas**, so whether `AppShell`
  survives at all is part of this ticket rather than a follow-up.

## What to build

- [x] **Move the story file rather than rewriting it.** `scripts/ui-catalog.ts:740`
      gives `review` the `Space/` title prefix as well as `Review/`, with the
      reason written in the source: *"A staged production surface may sit beside
      the stable stories it will eventually join without becoming parity evidence
      before the application reaches it."* That is this ticket's runway. Moving
      `command-dock.stories.tsx` from `stories/review/` to `stories/space/` flips
      it from `stable: false` to `stable: true`, and the checker then demands a
      parity claim for **every named export in it** — so trim the sheet's
      exports to the ones that are evidence before moving it, not after.
- [x] **Mount the Dock in `App.tsx` and delete both Sidebar modules.** The
      acceptance criterion is that `SpaceSidebar.tsx` and `OpenSpaceSidebars.tsx`
      are gone, not that they are unused.
- [x] **Delete the thirteen Sidebar claims. Write Dock claims in their place.**
      Do **not** carry them across and do not rename their ids. An earlier
      version of this ticket said they "survive the Sidebar". That is wrong, and
      the audit below is the evidence: four of the thirteen name the Sidebar in
      the claim sentence itself, and five state behaviour the Dock does not have
      or has decided against. Carrying one asserts that the behaviour did not
      change. Nobody verified that.

      Each new claim states one obligation in the Dock's own words. Audit it
      against the built surface before you write its tests.
      `ui-catalog.ts:784` fails a stable story export with no claim and `:780`
      fails a claim naming no story, so the delete and the create are one change
      or the check is red in both directions.
- [x] **Rewrite the two Playwright specs, do not delete them.**
      `packages/app/ladle-e2e/issue-14-space-sidebar.spec.ts` carries 12 of the
      `@parity:` tags; `packages/app/e2e/` carries the application half. The
      checker holds each claim to **exactly one test in each suite**, read out of
      the sources rather than out of a run, so a deleted test fails the check
      even when no test fails.
- [x] **`mobile-sidebar.spec.ts` is the responsive story coming due.** It is the
      only place the phone branch is exercised at all, and everything it proves
      — focus trapping, inert content behind, every command dismissing the Sheet
      first — came free from the Sidebar primitive. ADR 0082 states the cost
      plainly: *"The responsive story is now ours."* Either the Dock has an
      equivalent and this spec is rewritten against it, or the obligation is
      unmet and the promotion is not done.
- [x] **Retire the three inventory entries that name this ticket's own
      precondition.** `OpenSpaceSidebars.tsx` (`design-system-inventory.ts:68`),
      `components/tabs.tsx` and `components/breadcrumb.tsx` each say they are
      staged under `stories/review` *until an application path exists*. This is
      that path. `ui:catalog:check` fails an entry whose subject has since gained
      a story, so each is either removed with its subject gaining stable
      evidence, or rewritten to a reason that is still true.
- [x] **Give `ParentIcon` a consumer and a claim.** `06` moved the cube to
      `packages/ui/src/icons.tsx:173` to lock the decision somewhere other than a
      throwaway sheet, and its doc comment carries the whole argument — the
      silhouette, the optical correction, the stroke, what it costs. What it does
      not carry is a check. Its only caller today is
      `command-dock.stories.tsx:2022`, and `ui:catalog:check` cannot see that:
      coverage resolves per **module** through the import graph, `icons.tsx` is
      already rendered by its siblings, so an unused export in it owes no
      inventory entry and fails nothing. This ticket is where the real consumer
      arrives, so one of the Dock claims written above states the parent mark's
      obligation in the Dock's own words. Without it the cube reaches V1 with a
      doc comment as its only evidence, which is what `06` moved it to avoid.
- [x] **Settle the destructive row's resting ink upstream.** `03:37` asked for
      `DropdownMenuItem`'s destructive variant to be fixed *so the consumer could
      delete its rule*, and closed with half of it done: the glyph override went
      (`packages/ui/src/components/dropdown-menu.tsx:107-116` records why), but
      `:118` still paints the row `text-destructive` at rest and the consumer
      rewrote its override rather than deleting it — `command-dock.css:400`, now
      without the `!important`. Same shape as the toolbar item below: `03` is
      closed, so it has no owner until this ticket takes it.

      It is a design disagreement, not a defect. `@project/ui` says red at rest;
      the prototype says *"a destructive row that is already red before it is
      reached spends the alarm on merely being in the list"*. Decide it once, in
      `@project/ui`, because at promotion the override stops being a prototype's
      opinion and becomes a production sheet contradicting the menu primitive —
      the second-design-system outcome `06` deleted the palette fork to prevent.
      The rule is also the sole surviving reason `.dock-proto__panel` exists, so
      settling it upstream is what retires that class rather than renaming it.
- [x] **Take the persistence report out of `role="toolbar"`.** Ticket `02` left
      this standing deliberately and deferred it to `03` because the fix is a
      `command-dock.css` change and that file was `03`'s. `03` closed without it,
      so it has no owner until this ticket takes it. The report is a child of the
      surface element, which is now the toolbar root, so a standing `Alert` sits
      inside `role="toolbar"` — a status region nested in a command region,
      which is what ADR 0082's *"status is not a command"* forbids. The fix is a
      positioned wrapper around the Toolbar so the report is its sibling rather
      than its child. This is treatment with an accessibility obligation behind
      it, so it is settled by a story and a behaviour test here and does not go
      near an ADR.
- [x] **Re-spell `continuation.ts`'s `sidebar-row` target** (`:40`, `:140`). It
      is one of the two arms `ChromeContinuation` spends. If the Dock has no
      rows in that sense, the name is a lie the next reader inherits.
- [x] **Update `CONTEXT.md` and `CLAUDE.md`.** `CONTEXT.md:9` offers
      "Sidebar/canvas" as the sanctioned words for the chrome, `:125` says the
      Cards collection's current rendering is a Sidebar, and `:145` says Open
      Spaces is drawn "beside the Space Sidebar". `CLAUDE.md`'s `ui` paragraph
      still describes the registry `Sidebar` as what the command surface composes,
      citing ADR 0053. None of that is true after this ticket.

## The claim audit

Thirteen claims name `space/space.stories.tsx` or `space/messaging.stories.tsx`
(`parity-claims.ts:218-305`). This is each one against the built Dock.

**The product name is not involved.** An earlier version of this ticket treated
the ids as assets to rename, which made the product name a blocker. It is not:
a deleted claim needs no new name for the old surface, and a new claim is named
for the obligation it states. "Command Dock" remains a working name and nothing
here waits on it.

| Claim | Verdict against the Dock |
| --- | --- |
| `space-sidebar-marks-one-current-renderer` | **Met.** The Layout cluster is one `DropdownMenuRadioGroup` over authored Layouts. This is ADR 0082's surviving clause and the most valuable claim in the set. |
| `space-sidebar-copies-graph-destinations` | **Met.** The Graph menu offers Copy link and Copy permanent link, and the comment beside them says why they are different addresses. |
| `space-sidebar-adds-empty-layout` | **Met**, under a different word. The command is **New Layout**, in the Layout menu, beside the list it adds to. |
| `space-sidebar-recovers-retryable-failure` | **Met.** `PersistenceNotice` is mounted unchanged with its Retry. |
| `space-sidebar-reports-permanent-rejection` | **Met.** `PersistenceControl`'s `AlertDialog`, mounted unchanged. |
| `space-sidebar-resolves-conflict` | **Met.** The same dialog. Portalled, so it needs no placement. |
| `space-sidebar-copies-card-destinations` | **Verify.** The Dock has no selected-Card cluster and no entity-actions menu. This may already belong to the Card rail (ADR 0073) rather than to this surface. Decide whose it is before writing the claim. |
| `space-sidebar-names-unauthored-state` | **Verify.** A new Space naming its initial Layout and empty Active Graph is an ADR 0079 obligation, not a Sidebar one. Check the Dock draws it. |
| `space-sidebar-entity-actions-menu` | **Not met, and the mechanism is gone.** The claim says "reached two ways from a Sidebar **row** — its trailing icon and a right click". The Dock has clusters, not rows, and no `onContextMenu` anywhere. Ticket item above finds the same fault in `continuation.ts`'s `sidebar-row` target. |
| `space-chrome-edits-names` | **Partly met.** `InlineTitleEditor` is there. The claim's subject — "between its active Sidebar **row** and Layout label" — is not. Restate it as one refusable draft per name, with no row in it. |
| `mobile-space-sidebar-adds-empty-layout` | **Not met.** The claim is about the Sheet dismissing after a command. The Sheet came free from the Sidebar primitive, and ADR 0082 states the cost: *"The responsive story is now ours."* Do not write a replacement claim until the Dock has the behaviour. This is the same gap `mobile-sidebar.spec.ts` names above. |
| `space-sidebar-withdraws-authoring-while-presenting` | **Obligation met, claim false.** The claim describes withdrawing Rename and Delete Layout from a Layout row's menu while leaving its address. The Dock hides the whole surface — `.dock-proto__surface[data-presenting='true'] { display: none }` — so there is no menu left to withdraw anything from. Restate the obligation; do not carry the mechanism. |
| `space-sidebar-shows-pending-persistence` | **Contradicted by a settled decision.** The claim is that a pending commit is exposed as saving. Ticket `01` settled that the Dock carries no resting cue at all: a commit settles faster than a dot can be read. `PersistenceIndicator` is never called. Do not write a replacement. Record the decision instead. |

**What the audit means for the count.** Six claims survive as obligations and
need only new words. Two need a decision about whose obligation they are. Three
are false about the Dock and must be restated. One is blocked on unbuilt
behaviour. One must not be replaced at all.

## On `03`

Not listed as a blocker, because promotion can happen with its eight workarounds
intact. But each one that is still a hand-rolled block in `command-dock.css` when
this ticket runs becomes a **production** hand-rolled block, and
`ui:catalog:check` then demands an inventory entry with a reason for it. That
converts `03` from an epic into a debt with interest. Prefer it done first.

## Evidence

Everything here reaches production and `packages/ui`, so all three bars apply:
`pnpm verify`, `pnpm e2e`, `pnpm e2e:ladle`. The third is its own CI job and is
the only one that can see a story broken by a component change.

## Comments

**Brought into V1 and sequenced ahead of three V1 tickets.** ADR 0082 supersedes
ADR 0053 and retires the Sidebar as the bound command surface; this ticket is
where that stops being true only on paper, because it deletes
`packages/app/src/components/SpaceSidebar.tsx` and
`packages/app/src/components/OpenSpaceSidebars.tsx`.

`v1-release/03`, `05` and `06` were all written against that module: `05` said
in as many words that it exposes the Graph lifecycle "through the Sidebar", and
`03` and `06` inherit it through the responsive obligation the Sidebar primitive
was answering. Running any of them first spends the work twice — once on a
surface being deleted, once on the one replacing it — and the second spend is
not a port, because the audit above shows five of the thirteen Sidebar claims
state behaviour the Dock does not have or has decided against. So all three now
carry this ticket in `Blocked by:`, and their surface language is the Command
Dock's.

The V1 tag is on `06` as well, since it is this ticket's own cleanup pass.

**The phantom blocker is gone.** Both tickets named "the theme change (no
ticket)". It merged as `a5a76669`, so nothing here waits on it.

## Found while building it

Four things this ticket asserted or left open, answered here so the next reader
inherits the answer rather than the assumption.

**The hand-rolled-block debt does not arise, and the "On `03`" section above is
wrong about why.** It reasons that every surviving block in `command-dock.css`
becomes a production hand-rolled block owing an inventory entry. That is true
only of `packages/app/src/styles.css`, which is the one stylesheet
`ui-catalog.ts:149` reads for the block half of the ratchet. The sheet went
*beside* the component instead, as `canvas-card.css` and
`markdown-source-editor.css` already do, and `ui-catalog.ts:948-960` says in its
own comment why that owes nothing: *"Colocation is the approved home for product
appearance, so these owe no inventory entry — recording them would turn the
inventory into a list of things that are fine."* The dead-rule half still runs
over it, so a class no production module names is still reported. `03`'s
remaining items are therefore ordinary debt rather than debt with interest.

**A Card's links and its Delete belong to the Card rail, and the rail did not
have them.** This is the audit's `space-sidebar-copies-card-destinations`
"Verify", decided: they are the rail's (ADR 0073), not this surface's — the
Dock's whole organising rule is that a Card's own commands are absent. But
`CanvasCard` already drew an `Actions for Card <title>` trigger that **nothing
in production passed actions to**, so the commands existed only in the Sidebar
footer and deleting it would have deleted Copy link, Copy permanent link and
Delete Card from the product. Wiring them through the rail is therefore part of
this ticket rather than a follow-up. The Sidebar's `DeleteCardControl`
confirmation goes with it: `EntityAction` has no confirmation concept, so the
dialog is lifted to the App root rather than invented in `@project/ui`.

**Renaming a Space is not a built Edit, so the Dock draws the Space name as a
label.** `space-authoring.ts`'s completion union has `renamed-layout` and
`renamed-graph` and nothing for a Space; `spaceEntityActions`' `space` arm offers
Copy link and no Rename, which is why the Sidebar's `space-title` was an `h1`.
The prototype's Space cluster offered an inline rename because a prototype over a
stored snapshot could just write `document.title`. Building it for real is a
domain change — it touches the stored document title and its relationship to the
Space Card that names the Space (ADR 0074) — so it is out of scope here and the
application and the story agree on a label. **This is a decision to take, not a
gap to close quietly**: `09-rename-a-space-as-a-real-edit.md` owns it.

**The Cards surface stayed the drawer, and that is the one thing the ticket does
not cover.** The prototype's Cards cluster discloses a Popover it draws itself,
chosen over "a Drawer from the screen edge" in a comparison recorded at the top
of the prototype. Production has `CardsDrawer` — an evidenced surface with seven
parity claims, its own stable story sheet, its own Ladle spec and its own unit
tests — and shipping both would be the "second place commands live" ADR 0082
rules out. Retiring an evidenced production surface is a second promotion rather
than a side effect of this one, so the Dock's Cards cluster opens the drawer and
the prototype's own list does not ship. **The popover-versus-drawer decision is
therefore still open and is now the only part of the prototype that did not
survive promotion.** `10-decide-the-cards-surface.md` owns it, and that ticket is where the
comparison gets made against the drawer that actually exists rather than against
a hypothetical one.

## Found while promoting it

Six more things the ticket did not know, recorded here rather than in a commit
message nobody greps.

**Four `@project/ui` modules and one `app` component lost their last consumer,
and none of them is this ticket's to retire.** `AddCardControl` (the Sidebar drew
it; the Dock's `CreateMenu` offers three peers instead, on grounds its own doc
comment states), the registry `sidebar.tsx` and the `sheet.tsx` and
`skeleton.tsx` only it imported, and `OpenSpaces.tsx` with the `tabs.tsx` only
*it* imports. `ui:catalog:check` demands a story or an inventory entry for the
first four, so they are recorded; the last two are in the check's blind spot and
owe nothing, because `dock-model.ts` takes `openSpaceStatusLabel` — which lives
beside the component in `OpenSpaces.tsx` — and the import-graph walk reads that
as the module being rendered. Retiring a primitive an ADR names is a foundation
decision rather than a surface one, so
`.scratch/command-dock/issues/08-retire-the-sidebar-era-primitives.md` owns
taking it, and it owns giving `openSpaceStatusLabel` a home that is not an
accident either way.

**A class written in a template literal's *tail* is invisible to the dead-rule
scan.** `ui-catalog.ts` reads a template's head and middles and cannot know where
a substitution's value ends, so `` `${SET_TRIGGER.className} command-dock__cards-trigger` ``
reported `.command-dock__cards-trigger` as a rule no production module names.
`cn(...)` says it, and costs the module its Fast Refresh boundary — a `cn` call
is not a constant export, so `react-refresh/only-export-components` fires on the
whole file. Both trigger treatments are in `components/command-dock-triggers.ts`
now, with the Dock's own class leading each template rather than trailing it.

**`react-hooks`' compiler-backed rules were bailing on `App.tsx`, and deleting
the Sidebar wiring is what stopped them.** The Sidebar-era `App` derived state
during render (`if (replacedAt !== authoringState.replacementEpoch) …`), which
the compiler cannot compile, so it reported nothing for the whole component. With
that gone it compiles, and five latent `set-state-in-effect` violations and one
`refs` violation appeared at once — none of them introduced here, and all of them
red on a bar that was green before. They are fixed rather than re-hidden: the
four resets are render-time transitions now, which is also what
`CommandDock`'s own `IdentityName` does and for the stated reason (an effect
draws one frame of a state that has already ended), and `visibleCentre` is state
rather than a ref, because a ref read by a handler the chrome object carries
makes that whole object a ref value the compiler will not let render use it.

**`DeleteCardConfirmation` is its own module.** `App.tsx` exports one
non-component (`createApp`), and lifting the Sidebar's delete confirmation to the
App root put a component in that file for the first time — which is the whole of
what `react-refresh/only-export-components` reports.

**An accessible name that is a prefix of another is a strict-mode violation.**
Each identity draws its name twice — `Layout: Collection 1` on the disclosure and
`Rename Layout: Collection 1` on the control beside it — so every Playwright
query for the first has to be `exact`. Written down because it is not visible
from the component and costs a run to discover.

**Every open Space stays mounted, so a test id matches the hidden ones too.**
`OpenSpacesApplication` hides all but one entry with `hidden`, which takes them
out of the accessibility tree — a role query skips them and `getByTestId` does
not. Anything reading `space-title` across more than one open Space is scoped
`:visible`.
