# 07 — Promote the Dock and retire the Space Sidebar

Status: ready-for-agent
Blocked by: the theme change (no ticket). 01, 02, 04 and 05 are closed.

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

- [ ] **Move the story file rather than rewriting it.** `scripts/ui-catalog.ts:740`
      gives `review` the `Space/` title prefix as well as `Review/`, with the
      reason written in the source: *"A staged production surface may sit beside
      the stable stories it will eventually join without becoming parity evidence
      before the application reaches it."* That is this ticket's runway. Moving
      `command-dock.stories.tsx` from `stories/review/` to `stories/space/` flips
      it from `stable: false` to `stable: true`, and the checker then demands a
      parity claim for **every named export in it** — so trim the sheet's
      exports to the ones that are evidence before moving it, not after.
- [ ] **Mount the Dock in `App.tsx` and delete both Sidebar modules.** The
      acceptance criterion is that `SpaceSidebar.tsx` and `OpenSpaceSidebars.tsx`
      are gone, not that they are unused.
- [ ] **Delete the thirteen Sidebar claims. Write Dock claims in their place.**
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
- [ ] **Rewrite the two Playwright specs, do not delete them.**
      `packages/app/ladle-e2e/issue-14-space-sidebar.spec.ts` carries 12 of the
      `@parity:` tags; `packages/app/e2e/` carries the application half. The
      checker holds each claim to **exactly one test in each suite**, read out of
      the sources rather than out of a run, so a deleted test fails the check
      even when no test fails.
- [ ] **`mobile-sidebar.spec.ts` is the responsive story coming due.** It is the
      only place the phone branch is exercised at all, and everything it proves
      — focus trapping, inert content behind, every command dismissing the Sheet
      first — came free from the Sidebar primitive. ADR 0082 states the cost
      plainly: *"The responsive story is now ours."* Either the Dock has an
      equivalent and this spec is rewritten against it, or the obligation is
      unmet and the promotion is not done.
- [ ] **Retire the three inventory entries that name this ticket's own
      precondition.** `OpenSpaceSidebars.tsx` (`design-system-inventory.ts:68`),
      `components/tabs.tsx` and `components/breadcrumb.tsx` each say they are
      staged under `stories/review` *until an application path exists*. This is
      that path. `ui:catalog:check` fails an entry whose subject has since gained
      a story, so each is either removed with its subject gaining stable
      evidence, or rewritten to a reason that is still true.
- [ ] **Re-spell `continuation.ts`'s `sidebar-row` target** (`:40`, `:140`). It
      is one of the two arms `ChromeContinuation` spends. If the Dock has no
      rows in that sense, the name is a lie the next reader inherits.
- [ ] **Update `CONTEXT.md` and `CLAUDE.md`.** `CONTEXT.md:9` offers
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
