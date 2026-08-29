# 11 — Enter a Space Card, and Open Spaces carries the session

**What to build:** The cut-over. Entering a Space Card from the canvas replaces the canvas with that Space and adds an entry to Open Spaces; the Space Sidebar survives the crossing, so the entered Space takes the canvas area rather than the viewport. Exit is an explicit command.

**Blocked by:** 09 — Build Open Spaces and the Space Sidebars, in Ladle; 01 — Draw an open Space Card as a compound-canvas sub flow; 10 — Extend the dev fixture to a tree of linked Spaces.

**Status:** ready-for-agent

- [ ] A Space Card on the canvas offers Enter. It is a Card command and belongs on the Card's rail as a kind command (ADR 0073), not in the canvas header — ADR 0053 closes that surface, and an earlier prototype pass was right to be rejected for putting it there.
- [ ] Entering adds the target Space to Open Spaces and shows it. The entered Space has its own React Flow instance and camera and is edited exactly as a Space opened normally is — **Enter is exempt from the compound canvas**, which scopes to the embedded open-Card case (ADR 0068).
- [ ] The loader that follows a Space Card carries the complete chain of containing Space ids into target intake. Root intake starts with an empty chain; each Enter appends the Space being left before loading the target, so `space-card-reference-cycle` catches every ancestor cycle rather than only direct self-reference. Do not make ancestry optional at this recursive seam or infer it from whichever entries happen to remain in Open Spaces.
- [ ] Entering seeds the new entry's Space View and Graph from the **Space Card's** selection. Changing either while inside is navigation, not an Edit: it writes neither the Card nor the Space. Leave the Space and come back and the selection is the one you left; reload and it is the Card's again (ADR 0068).
- [ ] **Entering a Space that is already open focuses its existing entry** rather than adding a second. Two views of one Space at once is what a second browser tab on its address is for (ADR 0069).
- [ ] Entries are persistent. Selecting one switches and closes nothing; more than one Space is open at once; Exit is the only thing that closes one. The root Space is never closable.
- [ ] An entry names a Space and remembers nothing about how it was reached, so closing one Space never closes another. **Back is the browser's history**, not a pop, and **Escape does not exit** — it keeps the meaning ADR 0048 gives it. ADR 0068 withdrew "Back or Escape returns to the containing Space".
- [ ] **Exit lives in the Space's own Sidebar**, beside the persistence controls, so a refusal and its recovery sit together (ADR 0068). Its refusal behaviour is issue 12.
- [ ] Open Spaces draws only from two open Spaces, and carries the status mark ADR 0068 allows.
- [ ] The stable Ladle story and its parity claims land here, with the application behaviour test ADR 0052 requires beside the Ladle one — this is the ticket where the application can finally reach the surface.
- [ ] The review prototypes under `packages/app/stories/review/` for this proposal are deleted: `space-card-rail.stories.tsx`, `space-card-canvas-prototype.stories.tsx` and their CSS. They were a decision surface; the decision is ADR 0068.

## Do not mine the prototype for behaviour

A review of the stacked Space Sidebar prototype found three defects in it, all left unfixed because ADR 0068 settled what they were asking about. **That prototype is not in the repository** — it was reviewed and dropped without ever being committed, so there is no file to read and nothing here to delete. What survives is the guidance. Build from the ADR, not from the prototype:

- Closing an entry *before* the active one recomputes the active index wrongly and snaps to the outermost Space. Closing an unrelated entry must leave the active one where it is.
- Its "Exit Space" control enables whenever more than one Space is open, but its handler returns unchanged at position `0` — so in the tabs model the control can accept a click and do nothing. Exit's real enablement and refusal are ADR 0068's and issue 12's.
- Its levels are **all** mounted for the prototype's whole lifetime, so a level keeps its selections even after being popped. That is a prototype artefact and not the design: switching away keeps an entry's live selection, and Exit destroys it, so a later Enter seeds from the Space Card again.

## Why this is one ticket and not three

The three halves — a command on a Space Card, a set of open Spaces that grows, a canvas that swaps — are not separately demoable. A set that grows with nothing entering it is issue 09, which already landed; a Space Card that enters nothing is not a behaviour. This is the narrow complete path.
