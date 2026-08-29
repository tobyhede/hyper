# 09 — Build Open Spaces and the Space Sidebars, in Ladle

**What to build:** The production components the entered-Space surface is made of — the vertical **Open Spaces** set, and the Space Sidebars behind it — driven by fixture Spaces in a Ladle story and reachable from nothing else yet. The application still has no way to enter a Space when this lands; issue 11 wires it.

**Blocked by:** none. Issue 08 accepted ADR 0068, which decides what Open Spaces draws and what an entry does.

**Status:** done

**Vocabulary.** ADR 0068 settled the names and this ticket uses them. The surface is **Open Spaces**; each item in it is an **entry**. "Rail" is ADR 0070's word for a Card's toolbar and is not reused. "Tab" is not a domain word — it means a browser tab. "Stack" names the model that was rejected, in which selecting an outer Space closes everything inside it. `CONTEXT.md` carries all three.

- [x] `@project/ui` gains Open Spaces as a presentation component over the `Tabs` primitive already in the package. It draws one vertical entry per open Space at a fixed height that does not change with how many are open, truncating a long title and scrolling once the set outgrows the column. The vertical-text treatment moves onto the component as a variant — it is styling, so it needs no ADR 0047 deviation, but it does not belong inline in `app`.
- [x] It is a real tab set in the ARIA sense: one tab stop, arrow keys between Spaces, `Home`/`End` to the ends, and the `aria-controls`/`id` pairing that says which surface an entry governs. None of that is hand-written; `Tabs` supplies it, and `role="tab"` is markup rather than domain vocabulary. The panels stay mounted, which is how each Space keeps its own live Space View and Graph selection (ADR 0068).
- [x] **Open Spaces draws only once more than one Space is open.** With one, it draws nothing and the Sidebar takes the full width. ADR 0068 decided this against the permanent-width alternative.
- [x] `app` gains the composition: N Space Sidebars, one per open Space, each composed exactly as the application composes one today, with only the active one showing. Each Sidebar stays **one Space's** command surface — what is session-scoped is Open Spaces beside it, not the Sidebar (ADR 0068's refinement of ADR 0053). Which Spaces are open and which is showing is the composition's state, not Open Spaces'.
- [x] Open Spaces sits *inside* the sidebar's width rather than adding to it, and the row is owned by the composition rather than taken from the primitive's inner flex box. The registry's own nested-sidebar row selector stops matching below the breakpoint, where Hyper's deliberate deviation sends `className` somewhere with no `data-sidebar` on it, and the failure is silent and phone-only.
- [x] An entry may carry a status mark for `conflicted`, `failed` or `rejected`, and nothing else. The save lifecycle stays in that Space's own Sidebar footer (ADR 0068, refining ADR 0053).
- [x] `SpaceSidebar`'s `collapsible` and `className` pass-throughs — added ahead of this decision while prototyping — either earn their justification here or are reverted.
- [x] A Ladle story drives the surface from fixture Spaces. It stays under `stories/review` or the components carry `uncataloguedComponents` entries: ADR 0052 wants a stable story to have an application proof too, and there is no application path until issue 11. The stable story and its parity claims land there.
- [x] `@project/ui` tests cover Open Spaces' own behaviour — the roving tabindex, and a hidden panel keeping its state.

## Not in scope

Exit. ADR 0068 puts it in the Space's own Sidebar, and it refuses on a Space that cannot save — that is issues 11 and 12. This ticket draws the set and switches between entries.

## Mobile is unverified and stays that way here

The prototype's reasoning about the mobile Sheet is written down and was never observed: the browser could not be driven below the breakpoint. Look at this on a phone before trusting it, and do not let a desktop-only check stand in for that.
