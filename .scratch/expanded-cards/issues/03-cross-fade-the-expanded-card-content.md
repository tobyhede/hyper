# 03 — Cross-fade the Expanded Card's content on open and close

**What to build:** Give the Expanded Card's content a real enter and exit, so nothing inside the Card appears or vanishes at full opacity while the box around it is still moving.

**Blocked by:** 02 — the node box must be the single animated element and `.canvas-card` must declare no size before content timing means anything. Fading content against a box that snaps just moves the discontinuity.

**Status:** ready-for-agent

## Why this is separate from 02

02 makes the *box* animate identically in both directions. That is a geometry fact and it is settled by which element owns the rect. This ticket is about the elements that mount and unmount inside that box — `MarkdownCardBody`, the `.canvas-card__content` rule beneath it — and mount/unmount is discrete, so no box transition can reach it. The two failures read the same to a user and have nothing in common in the code.

`@starting-style` with `transition-behavior: allow-discrete` is the native answer and is Baseline, but it animates an exit only for an element that stays in the DOM. React's unmount defeats it, and keeping every Card's Markdown mounted to toggle `display` means parsing content for Cards that are collapsed — which expansion being *authored* makes the common case. So the exit is bought with a delayed unmount instead.

## Content timing

- [ ] Content fades on `opacity` only. Nothing inside the Card animates its own size, position or type — that would reintroduce the second driver 02 removes.
- [ ] The fade uses 02's duration and easing tokens. No new duration is introduced; the content's timing is expressed as a fraction of the box's.
- [ ] Opening is asymmetric to closing on purpose: content fades in over the tail of the growth (so the Markdown reflowing as the box widens is hidden behind it) and fades out immediately on close, faster than the box shrinks. Content must never outlive its box.
- [ ] The `.canvas-card__content` border travels with the content it belongs to rather than appearing at full strength on frame one.
- [ ] `prefers-reduced-motion` is honored through the same token, not a second rule.

## Delayed unmount

- [ ] The exit is a small presence hook in `@project/ui` — the `AnimatePresence` pattern without the dependency: keep the children mounted for the exit duration, mark them leaving, then unmount. Do not add an animation library, and do not reach for the View Transitions API (its snapshots scale-blur a growing Card's border and title, and a named element breaks free of the ancestor clip and transform that React Flow's zoomed pane and the Card's `overflow: hidden` depend on).
- [ ] The hook is presentation-agnostic and takes its duration from the caller. It knows nothing about Cards, expansion or React Flow.
- [ ] A leaving body is inert: no caret, no edit affordance, no focus target. A Card closed mid-edit must not leave a live CodeMirror in a shrinking box.
- [ ] Toggling faster than the duration must settle correctly — reopening during a collapse cancels the exit rather than queueing a second one.

## Evidence

- [ ] Ladle story states for entering, at rest and leaving content, driven by the component's own props rather than by timing the test.
- [ ] Ladle E2E asserts through `getAnimations()`: a running `opacity` transition on the content after a close, and no content in the DOM once it has finished.
- [ ] ADR 0052 parity — each retained story behavior maps to both Ladle and application evidence.

## Verification

- [ ] Run `pnpm verify`.
- [ ] Run `pnpm e2e`.
- [ ] Run `pnpm e2e:ladle`.
- [ ] Report the real output of all three commands and record the final evidence under `## Answer` before resolving the ticket.

## Not in scope

The box geometry (02), the `NodeResizer` handles, which are bound to selection rather than expansion, and any motion on the Alias kind, which has no Expanded front yet.
