# 01 — Choose the link action pattern

**What to build:** Replace the Sidebar's persistent "Copy link to X" / "Copy link in this Space View" buttons with one link-action control that appears only on the selected entity, reachable by hover or focus, for Cards, Graphs, Space Views and Spaces alike. This ticket does not change addressing, routing, or the product-destination table (ADR 0069, ADR 0072) — only where and how a person reaches the two link forms those ADRs already define.

**Status:** needs-triage

## Prototype

`packages/app/stories/review/link-actions-prototype.stories.tsx` — a Ladle review story built from real `@project/ui`/`@project/app` chrome (`ApplicationChromeFixture`, `Sidebar`, `Button`, `DropdownMenu`, `Popover`), switchable with `?variant=smart|menu|share`. Nothing wires to the real clipboard, navigation, or authoring — every action appends to an on-screen log so the interaction can be judged without side effects.

Run `pnpm --filter @project/app ladle`, open `Review/Link Actions`, and flip through the three variants (bottom pill, or `←`/`→`). Each variant renders the same five states: a Card inside the current Layout, a Card outside it, the active Graph, the current Space View, and the Space.

## The three variants

- **A — Smart default.** One icon button copies the useful default outright; a small chevron beside it opens a one-item menu for the alternative, only when one exists ("Copy permanent link" + "Open in new tab").
- **B — Actions menu.** One kebab trigger opens a menu naming every command explicitly — "Copy link" and, when it differs, "Copy permanent link" — each with a one-line destination description, plus "Open in new tab". Nothing is guessed.
- **C — Share popover.** One trigger opens a popover that explains each destination in a sentence before it's copied, with its own Copy and "Open in new tab" controls per row. The popover stays open after a copy so a second destination can be copied too.

## Recommendation

**Variant A (Smart default).** One click is the dominant case — a person selecting a Card or Graph to share almost always wants "the link that reproduces what I'm looking at," and Variant A gives them that in a single press, matching the precedent set by Figma's node-scoped "Copy link". The permanent/durable alternative exists but doesn't cost the common path a second click. Variant B is safer (nothing is guessed) but taxes every copy with a menu open, even though the two options are needed together rarely enough that the current Sidebar already treats them as separate, optional buttons. Variant C is the right shape for a first-time or infrequent user — the explanatory sentences are the clearest teaching surface of the three — but it's heavier than day-to-day link copying warrants, and its two-destination layout is only earning its space when a permanent link is actually offered (three of the five demonstrated states have only one destination, where it's just a wider Variant A).

If discoverability turns out to matter more than speed once this is in front of users, B is the safer fallback — it's already a strict subset of A's total surface (same trigger, same menu content, one extra click to reach the default).

### Default behavior

A single click/press on the primary control copies the address that reproduces what's currently on screen: a Card or Graph within the active Space View when that address exists, falling back to the entity's own address otherwise. This is `default` in the prototype's `LinkEntity` shape, and it's what Figma, Notion and Linear all default their per-item "Copy link" to.

### Terminology

Never "canonical" or "contextual" in user-facing copy. Every destination is described by what it does, not by its implementation category:

- The default is presented as **"Copy link"**, with no further label needed since it's the whole control.
- The alternative, when offered, is **"Copy permanent link"** — "permanent" already means what it needs to to a general audience (cf. "permalink"), without naming a domain concept.
- Every menu item and popover row carries a one-sentence destination description ("Opens Constraints inside Layout 1, selected the way it is now" / "Always opens Constraints on its own, wherever it's placed") so the difference is legible without the reader knowing the domain model.

### Placement

On the entity itself, not in the Sidebar as standing chrome: a Card's own rail (`CardRailAction`, alongside Open/Close), a Graph's row in the Sidebar's Graphs list, the canvas header for the current Space View, and the Space's own title area in the Sidebar — always revealed by hover or keyboard focus, never permanently visible. This keeps one placement rule for all four entity kinds rather than one rule per kind, and it means adopting this doesn't add a single pixel of chrome to a screen where nothing is selected.

### Consistency across Card, Graph, Space View and Space

One trigger shape, one confirmation treatment, one keyboard model, applied to whichever entity is currently selected or in focus. What varies is only whether a second (permanent) destination exists at all — never the control that offers it. A Card outside the active Layout, a Space View, and a Space itself never had two meaningfully different addresses to begin with (ADR 0069's contextual address requires Layout membership; a Space View and a Space each have exactly one canonical address), so their control simply has nothing to open a menu over — it collapses to the single default action, which the prototype's "Deployment notes" and "Layout 1"/"Presentation kit" states demonstrate.

### No contextual address

The secondary control (chevron / extra menu row / extra popover row) is omitted, not shown-disabled — matching the existing production rule in `SpaceSidebar.tsx` ("the command is withheld rather than shown and refused, because the destination it would copy does not exist"). A Card the Cards collection reveals but the active Layout doesn't place gets one control, one destination, no dead end.

### "Open in new tab"

Shares the surface with "Copy link" in variants B and C — it's one more command about the same destination, not a separate concern. In variant A it lives inside the secondary menu alongside the permanent link, not on the primary one-click control, so the fast path stays a single, unambiguous outcome.

### Confirmation

The trigger's own icon swaps to a checkmark for ~1.6s after a copy (variant A/likely also B via the trigger, since menu items close on selection), or the row's own button label changes to "Copied" without closing the surface (variant C, since a second destination may still need copying). No toast, no dialog. A `role="status"`-equivalent live announcement should accompany the visual change in the real implementation so a screen-reader user hears "Link copied" without a focus change — the prototype logs the same event to an on-screen panel instead, for review purposes only.

### Keyboard and focus

Standard Base UI trigger/menu/popover behavior throughout, left untouched: Tab reaches the trigger (always tabbable, not only hover-revealed — see narrow screens below), Enter/Space activates it, Enter/Space/ArrowDown opens a menu or popover, arrow keys move through menu items, Escape closes and returns focus to the trigger. Nothing here overrides that contract.

### Narrow screens

`showOnHover`-style reveal (used throughout the prototype's row styling) already resolves to always-visible below the `md` breakpoint and hover/focus-revealed above it, so no separate narrow-screen treatment is needed for visibility. Variant C's popover width (`w-72`–`w-80`) should be sanity-checked against small viewports when this is implemented for real; collapsing it into the existing `Sheet` primitive below a breakpoint is a reasonable follow-up if the popover doesn't reflow cleanly, but that's a production-time decision, not a prototype one.

## Open follow-ups for whichever variant is chosen

- Wire `onCopyCanonical`/`onCopyContextual` (or their renamed equivalents) to the real `copyProductDestination` path in `App.tsx`, replacing the Sidebar's `graph.links` and `cardLinks` footer rendering.
- Decide whether the Graph row's trigger lives inside `SpaceSidebar.tsx`'s existing Graphs list (requires a small production change to that component) or is deferred until a broader Sidebar row-actions pass.
- Extend the same control to the canvas header (Space View) and the Sidebar's Space title (Space) in production chrome — neither exists as a link action today.
- A Ladle behavior test and an application behavior test per ADR 0052, once the winning variant is reimplemented as production code rather than prototype code.
