# 05 — Make the production canvas Card a design-system component

**What to build:** Bring the real React Flow Card into the agreed design language for Markdown and Alias Cards, all interaction states, title editing and authoring actions, without changing graph placement or gesture semantics.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-human

- [x] The production Card, rather than a Ladle-only facsimile, renders the accepted visual treatment for kinds and interaction states.
- [x] Title editing, card editing, connection controls and handle visibility retain their existing keyboard, pointer and focus behaviour.
- [x] React Flow geometry and handle contracts remain adapter-owned, while the Card's visual controls consume shared design-system components and tokens.

## Audit note

The real React Flow node now renders `CanvasCard`, so this is production work,
not a Ladle-only specimen. The Connect and Edit actions passed from `CardNode`
are still raw buttons; replace them with the shared control surface or record a
deviation that clears ADR 0047's bar. Preserve the existing pointer, focus,
drag and handle contracts while doing so.

## Implementation

`@project/ui` now exports `CanvasCard`, the one design-system Card front for
Markdown and Alias Cards. It composes the shared shadcn Card family, owns the
kind and interaction-state treatments, and accepts explicit slots for the title
editor, authoring actions and React Flow handles. Alias Target text remains a
kind-owned line rather than a shared Description slot.

The production `CardNode` translates React Flow selection, hover and dragging
into that interface and supplies its existing editor and real handles. Connect
and Edit now use the shared Base UI `Button` facade with the same accessible
names and event containment as before; hidden-at-rest actions remain keyboard
focusable and reveal on focus. Handle creation, connectability and inline
geometry remain unchanged in `@project/react-flow-adapter`; the handles remain
siblings of the design-system front, so the shared component owns no React Flow
contract.

The stable `Components/Canvas Card` story renders the exported production
component, and parity claim `canvas-card-exposes-kind-and-keyboard-actions` maps
its Ladle behavior test to a production application test. Unit coverage pins the
shared component interface and `CardNode`'s state translation while the existing
title, action and handle tests remain green.

Verification: both TypeScript passes, ESLint, anti-slop lint, Prettier and the
full Vitest coverage run pass. `pnpm e2e` passes 100/100 and `pnpm e2e:ladle`
passes 18/18. `pnpm verify` itself stops at the pre-existing catalogue failure
for Issue 04's four operational-feedback stable stories, which have no parity
claims; the new Canvas Card claim is accepted. The ticket remains
`ready-for-human` rather than claiming a fully green required gate over that
unrelated baseline failure.
