# 15 — Settle the open-disclosure treatment, which now reaches every ghost trigger

Status: needs-triage
Tags: release/v1
Blocked by: nothing. `07` landed the change this ticket is about (`36165cf7`).

**Written before ADR 0085.** `CardSearchCombobox` below is spelled
`ThingSearchCombobox` now; the component and the reasoning are unchanged.

**Both premises still hold**, checked at `37e44bc2`: `packages/ui/src/Button.tsx`
carries `aria-expanded:bg-secondary aria-expanded:text-secondary-foreground` on
the feedback string shared by `ghost` and `receded`, and
`SelectedEdgeControls.tsx`'s "Edit this Edge" trigger is still there to inherit
it.

**What to decide:** whether a `ghost` trigger filling while the thing it
discloses is open is the rule for the whole application, or a Dock treatment
that reached further than it was meant to.

## What happened

`07`'s adversarial review found the Command Dock still owning Button appearance
through application selectors — `command-dock.css` overrode the open
disclosure's foreground and background, and the parent crumb's foreground, over
controls the shared recipe draws. That breaches the styling rule
(`className` for layout, not styling) and left a second owner of Button
appearance after the Space-name typography pass.

Both rules also won only by load order, which is worth recording because it
means neither was ever a deliberate override: `.command-dock__crumb` carries
specificity (0,1,0) and merely *tied* Tailwind's `text-muted-foreground`.

The fix moved both into `packages/ui/src/Button.tsx`: an `aria-expanded` state
on the shared quiet recipe, and a new `receded` variant for the crumb. Keying
the open state on `aria-expanded` was chosen deliberately, because it preserves
the property the deleted rule had — a control added later is covered without
being told.

## The consequence, which is this ticket

`aria-expanded` on the shared recipe reaches **every** `ghost` disclosure
trigger, not only the Dock's. Two candidates were checked at the time:

- `CardSearchCombobox`'s trigger swaps for the Clear button when open, so it
  takes no fill and is unaffected.
- `SelectedEdgeControls`' **"Edit this Edge"** popover trigger now fills while
  its editor is open. This is a visual change to a surface outside the Dock,
  and it was neither asked for nor reviewed as part of `07`.

It was judged correct rather than a regression — a trigger with something open
reading as open is the rule the ADR text already argues for — and `07` shipped
on that judgement. **That judgement is the thing to confirm or overturn here**,
which is why this is `needs-triage` and not `ready-for-agent`: the work is small
either way and the decision is the whole of it.

## The two answers

**Keep it.** The rule becomes application-wide: a ghost disclosure trigger
reads as open while it is. Then this ticket's work is evidence rather than
change — `SelectedEdgeControls` gains a claim and a story showing the open
treatment, because right now the behaviour ships with nothing asserting it.

**Narrow it.** A dedicated `disclosure` variant carries the open state and
`ghost` goes back to being inert. This was the alternative at the time and was
not taken for a reason that no longer applies: it needed call-site changes in
`App.tsx` and `command-dock-triggers.ts`, both outside the ownership of the
agent doing the work. It also loses the "covered without being told" property,
so every future disclosure trigger has to remember to opt in.

## Evidence either way

`packages/ui` and a production surface, so all three bars: `pnpm verify`,
`pnpm e2e`, `pnpm e2e:ladle`. The third is the only one that can see a story
broken by a component change, and this is a component change.

## Comments

Recorded because the decision currently lives only in
`.scratch/command-dock/findings/adversarial-dock-review-2026-09-10.md`'s
`## Answer`, inside a report marked resolved — which is where a decision goes to
stop being noticed. Raised three times during `07` and moved past each time;
that is a decision taken by default rather than a defect, and this ticket is
what makes it a decision taken on purpose.
