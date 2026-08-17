# 02 — Replace the workspace toolbar with a Menubar

**What to build:** Give the workspace a persistent desktop menubar for View, Layout, Graph, Cards and presentation commands. Its selection, disabled, persistence-conflict and keyboard behaviour remains equivalent to today's controls while its grouping and accessibility follow the shared design system.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] View, Layout and Graph selection are represented as mutually exclusive menu choices, with the current selection visibly and accessibly identified.
- [ ] Card creation and Present/Overview remain reachable with their existing availability rules and keyboard commitments.
- [ ] `AddCardControl` composes its menu half through the shared
      `DropdownMenu` surface and semantic tokens while preserving the accepted
      split-control behavior: `modal={false}`, conditional focus return when
      Add Alias opens a pane, and `nokey` protection for the portalled popup.
- [ ] Normal, pending, failed and conflicted persistence states are clear without treating status as a menu command; Ladle presents each state using the production composition.
