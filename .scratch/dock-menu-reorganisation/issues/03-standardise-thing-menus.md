# 03 — Reorder Markdown and Alias Thing menus

**What to build:** Reorder Markdown Thing and Alias entity menus so Create Alias comes first, then the copy commands, then the two leaving commands. Apply the same grouping wherever those menus are exposed, including dropdown and context-menu presentations. This is reorganisation: reorder only. No command is added or removed. Create Alias, both copy commands, Remove from Diagram and Delete from Space keep their current effects, destinations, availability and reporting.

**Blocked by:** None — can start immediately

**Status:** done

- [x] A placed Thing's menu shows these groups in order, with one separator between groups: Create Alias; Copy link to Thing in Diagram, Copy link to Thing; Remove from Diagram, Delete from Space.
- [x] Labels match those above. The two leaving commands share the final destructive group.
- [x] Create Alias uses the invoked Thing as its immutable Target, completes creation on activation, copies the Target's Title once and continues in the new Alias's Title editor. The row remains visible and unavailable on an Alias.
- [x] Copy link to Thing in Diagram and Copy link to Thing copy the same destinations they copy today. Clipboard success and failure reporting remains accurate.
- [x] Where a menu represents a Thing not placed in the current Diagram, omit the within-Diagram address and Remove from Diagram. Conditional commands produce no empty groups or redundant separators.
- [x] Remove from Diagram retains its membership-only meaning; Delete from Space retains its broader deletion meaning, existing confirmation and safeguards.
- [x] Use the shared entity action grouping and UI menu primitives, following shadcn-first-ui. Dropdown and context-menu presentations share the command definitions and remain operable by pointer and keyboard.
- [x] Application and Ladle behaviour evidence verifies ordered groups and boundaries, Markdown Thing and Alias availability, creation continuation, copied destinations, and the distinct effects of removal and deletion.

**Implementation note:** `thingRailActions` in `packages/app/src/App.tsx` already
built exactly these commands (Create Alias, both addresses, Remove from
Diagram, Delete from Space) for a Markdown/Alias Thing — only the order of the
concatenated groups changed, from `[...addresses, ...alias, ...leaving]` to
`[...alias, ...addresses, ...leaving]`. The "not placed in the current
Diagram" case was already unreachable through this rail (only placed Things
have a canvas node to hang a rail off), so nothing there needed changing.
Dropdown and context-menu presentations already shared one `EntityActionGroup[]`
(`CanvasThing.tsx`'s `EntityActionsTrigger` and `EntityActions`), so the
reorder applies to both by construction — proved directly by a new app e2e
right-click test. The Space Thing branch (`thing.kind === 'space'`) is
untouched; that is ticket 04.
