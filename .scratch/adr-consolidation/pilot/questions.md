# Map and Graph pilot: fixed question set

Ticket: `.scratch/adr-consolidation/issues/01-prove-map-graph-pilot.md`, checklist item 2.

This set is fixed against source decisions at snapshot `e836ecab07d339425320513d52c9ccb39b158db4` (2026-10-03), before any specimen was drafted. Rule ids (R…), alternatives (A…), disagreements (D…) and gaps (G…) refer to `inventory.md` in this directory.

Give the same questions, in the same order, to both the baseline route and the specimen route. Each question asks about behaviour and reasons, so a reader should not be able to answer it by quoting a heading.

## Grading rubric

Grade each question **pass** or **fail**.

A question **passes** only if all of the following hold:
1. The answer states every item under "Must state", in any wording.
2. It contradicts no item under "Must not contradict". Stating an item there is not required unless "Must state" also lists it.
3. It introduces no behaviour the sources reject, such as a new entity, a render path or a stored field.
4. Where the question asks why, the answer gives the source reason or an equivalent, not a restatement of the rule.

An answer that is correct but omits a "Must state" item **fails**. A shorter answer that is wrong cannot pass, however well it reads.

- **Partial credit:** None for correctness. Record the missing or contradicted items as findings.
- **Reading effort:** Score it separately, and never in the correctness grade. Record sources opened, words encountered and elapsed time.
- **Ambiguities:** Where a question touches an open ambiguity (listed at the end), the answer passes if it either takes the position stated as acceptable or names the ambiguity. It fails if it asserts a resolution the sources do not make.

---

## Q1. Adding an automatic tidy-up command

> You are adding a command that tidies the Resources on the selected Map automatically, using a grid or a graph-layout engine. Where does the computation run, what does it change, and what must it never become?

**Expected answer:**
- **Trigger and target:** The author invokes it explicitly over an existing Map. It is an authoring operation.
- **Computation:** An automatic layout strategy computes positions for that Map's member Resources.
- **Result:**
  - The positions are written into that same Map in **one Edit**, which rewrites the whole Map destructively.
  - The Edit persists like any other.
  - Once written, the positions are ordinary authored positions.
- **What it must never become:**
  - It does not run at render time.
  - It is not a second kind of canvas, a selectable or addressable context, or something the renderer decides.
  - The positioned strategy stays the only strategy that draws the canvas.
- **Output shape:** The strategy's output is positions only: no ports, routed Edge geometry or waypoints, and no separate result type.
- **Engines:** One may be reintroduced, but only attached to this Edit. Never seed or constrain it to honour a drop point.
- **Status:** Accepted but not built today.

**Rules preserved:** R6, R2, R3, R4, R5, R7, R8.

**Must state:**
- It is an explicit Edit over an existing Map.
- It rewrites positions in that Map.
- It never runs at render, and is not a selectable or addressable canvas context.
- It is not built yet.

**Must not contradict:**
- It creates no new Map or view (R6).
- No strategy is privileged (R3).
- No Arrangement type (R5).
- No drop-point seeding (R7).
- It does not claim a working undo exists (D12). See Ambiguity 1.

**Sources:** ADR 0086 (paragraph 2, "A removal, not a prohibition"), ADR 0014 (paragraph 2), ADR 0079 (paragraph 2), ADR 0084 ("Authored positions may now be written…"), CONTEXT "Layout strategy".

## Q2. A proposed result type for strategies

> A reviewer proposes that each layout strategy return a new value type holding the computed coordinates, separate from the graph it was given, for the canvas to consume. Should you accept it? Why or why not?

**Expected answer:**
- **Verdict:** No.
- **What a strategy does instead:** It takes the layout-strategy graph and returns the same shape with optional `x`/`y` filled in on each Resource element. There is no intermediate arranged-result type.
- **Why:**
  - It buys nothing, because every consumer wants the positions.
  - It adds a translation step at the seam the project keeps thin. React Flow already carries a position on the node and has no layout entity, so a new type would sit between Hyper and the library.
  - What a strategy produces is positions only, which a Map's placement already holds, so a separate type would carry nothing extra.
- **Vocabulary:** "Arrangement" is not a domain entity. The word is avoided as a noun.

**Rules preserved:** R5, R4.
**Alternative:** A1.

**Must state:**
- No separate result type.
- Geometry rides as optional fields on the elements the strategy was given.
- The reason "every consumer wants the positions / it adds a translation step", or the equivalent that the only output is positions, which the Map's placement already holds.

**Must not contradict:**
- The contract carries no ports or routed sections (R4).
- Do not justify the answer by elkjs being present today; it is not (A1, O4).

**Sources:** ADR 0005 (paragraph 3), ADR 0014 ("costs accepted" paragraph), ADR 0041 ("Domain and module interfaces"), ADR 0086, CONTEXT "Placement" and "Layout strategy" _Avoid_.

## Q3. Listing Spaces that have no Map

> You are building a picker that lists every stored Space, and you notice some stored Spaces have no Map at all. Should listing give them one? What happens when an author first opens one of them, and what happens to the Resources it already holds?

**Expected answer:**
- **Listing:** It must not initialize anything. Neither do importing, exporting or reference validation; they read stored state as it is.
- **First complete working-state read:** This is a direct open, Entering, rendering an open Space Resource of it, or linking to it. Before returning, it atomically persists:
  - an empty `Map 1`
  - its empty Active `Graph 1`
  - the `defaultMap`
- **Existing Resources:** They are **not placed**. They stay outside the new Map, reachable from the Resources View, because there is no authored basis for guessing their positions.
- **Commit and conflict:**
  - The initialization must commit before the Space becomes working.
  - On a conflict, it reloads and accepts a competing initialization.
  - Any other failure prevents opening.
- **Maps but no default:** A stored Space with Maps but no default just records its first Map as default and creates nothing.
- **New Spaces:** They never reach this path. They are created complete.
- **Inference:** Newness is never inferred from Resource count, and no creation marker is stored.

**Rules preserved:** R15, R16, R17, R18, R19, R20, R14.
**Alternatives:** A5, A6, A9.

**Must state:**
- Listing never initializes.
- The first working read persists an empty Map with an empty Active Graph and the default before returning.
- Existing Resources are not placed.
- The reason: no basis for guessing positions.

**Must not contradict:**
- Initialization is atomic and committed before use (R19).
- Export and import do not initialize (R18).
- No layout strategy seeds positions (R16).
- No newness inference or marker (R20).

**Sources:** ADR 0079 (paragraphs 3–4), ADR 0080 (paragraphs 2–4), `AGENTS.md` 0079 entry.

## Q4. Adding another Map

> An author adds another Map to a Space that already has several Resources. What exactly does that one Edit produce, which Resources appear on the new Map, and what stops an author from later deleting every Map?

**Expected answer:**
- **The Edit:** One Edit creates **and selects** a new Map. It has no Resource members and owns exactly one empty Graph, which is its Active Graph.
- **Resources:** The Space's existing Resources do not appear. They stay outside until an author adds them, for example from the Resources View.
- **No Map without a Graph:** A Map is never without a Graph.
- **The empty Graph:** It is valid and may be active. It cannot be presented until it has an Edge.
- **Deletion limit:** The last Map of a Space cannot be deleted, because a working Space must keep a durable default Map.
- **Choosing a Map:** Choosing between existing Maps is navigation, not an Edit.

**Rules preserved:** R11, R9, R10, R12, R22, R30.

**Must state:**
- The new Map is empty, owns one empty Active Graph, and is created and selected in one Edit.
- Existing Resources are not added.
- The last Map cannot be deleted, with the default-Map reason.

**Must not contradict:**
- Map selection is not an Edit (R10).
- A Map always owns at least one Graph (R22).
- Whether the new Map becomes the recorded default: see Ambiguity 3. Neither "always" nor "never" is required.

**Sources:** ADR 0079 (paragraph 5), ADR 0040 (paragraph 4), ADR 0041 (paragraph 3), CONTEXT "Graph".

## Q5. Managing a Map's Graphs

> You are implementing adding and deleting Graphs inside a Map. What must happen when the author deletes the Graph currently being emphasised, or the only Graph left? And could a second Map reuse one of this Map's Graphs?

**Expected answer:**
- **Adding:** Appends a new empty Graph to the Map's ordered collection and makes it active, in one Edit.
- **Deleting:**
  - Survivors keep their order.
  - Deleting the Active Graph makes the first surviving Graph, in authored order, active.
  - The last Graph of a Map cannot be deleted.
- **Ownership:**
  - A Graph belongs to exactly one Map and is never shared or reused.
  - A second Map that wants the same narrative holds its own Graph. The accepted cost is duplication, with copies that can silently diverge.
  - The reason: with a shared Graph, removing a Resource from one Map would either leave a dangling Edge or change every other Map.
- **Ids:** Graph ids are unique across the whole Space.
- **Deletion side effect:** Deleting a Graph relocates any Space Resource that selected it.

**Rules preserved:** R22, R24, R25, R26, R27, R13.
**Alternatives:** A10, A11.

**Must state:**
- Append and activate on add.
- The first survivor becomes active.
- The last Graph cannot be deleted.
- Graphs are never shared, with the dangling-Edge-or-cross-Map-change reason.

**Must not contradict:**
- Graph id is unique in the Space (R24).
- Survivor order is preserved (R25).
- Every Edge is closed over its Map's members (R23).

**Sources:** ADR 0040 (paragraphs 1, 3–4 and "Why ownership follows authoring"), ADR 0041, ADR 0108, ADR 0091.

## Q6. Removing an Open Resource from one Map

> An author removes a Resource from one Map. It is currently Open on that Map, it has Edges in two of that Map's Graphs, and it also sits in a second Map. Describe everything the removal changes and everything it leaves alone.

**Expected answer:**

What changes, in **one Edit**:
- The Resource's membership and position leave **that** Map. They are one fact, the position key.
- Every Edge incident to it is removed from that Map's Graphs.
- Because it was Open, the room it held is given back to the neighbours it had displaced.

What it leaves alone:
- A Graph emptied by the removal stays.
- The Resource is not deleted from the Space, and its place and Edges in the second Map are untouched.

Afterwards:
- The Resource is simply absent from the first Map. The canvas never invents a position for it.
- If it is later added back, it arrives Closed, at a new initial position, with no Edges restored.

Contrast: Deleting the Resource from the Space would run this same cascade in every Map.

**Rules preserved:** R31, R32, R34, R35, R36, R33.

**Must state:**
- Membership and position removed together from this Map only.
- Incident Edges removed in this Map's Graphs, in the same Edit.
- Emptied Graphs remain.
- The Resource remains in the Space and the other Map.

**Must not contradict:**
- Omission means absent, never the origin (R31).
- No automatic placement for omitted Resources (R31).
- Room reclaim for an Open Resource (R35, see Ambiguity 2).
- Earlier Edges are not inferred back on re-add (R33).

**Sources:** ADR 0040 (paragraphs 2–3, Consequences), CONTEXT "Map", "Graph" and "Placement", `snapshot-edits.ts` (build evidence only).

## Q7. Which neighbours an Open moves

> A Closed Resource S is opened. Around it are:
> - a Resource A to its right, whose top edge is 40 units lower than S's top;
> - a Resource B directly below S;
> - a Resource C below and to the right of S;
> - a Resource D that overlaps S's closed rect.
>
> Which of A–D move, in which direction, by how much, and when are the new positions recorded? Why not move C both right and down?

**Expected answer:**
- **Growth:** S's Open Size minus the fixed Closed Size, floored at zero on each axis.
- **Each neighbour:**

  | Resource | Clear of S's collapsed rect? | Moves |
  | --- | --- | --- |
  | A | At or past the right edge | Right by the width growth only, despite being lower |
  | B | Not clear on x; at or past the bottom edge | Down by the height growth |
  | C | Clear on both axes | Right only, because x is decided first |
  | D | Overlaps | Does not move |

- **When:** The Open Edit itself writes the new positions into the Map. Nothing is derived at render, and a drawn position is an authored one. Close applies the negation, and Resize applies the difference.
- **Why one axis:**
  - One axis is enough to stay clear of the grown Resource.
  - Moving a Resource that stands beside S vertically produced an unpredictable jump on Close.
  - Measuring against the collapsed rect keeps Open and Close choosing the same set, so they remain a pair.
- **Accepted cost:** A grid of Resources no longer scales uniformly.

**Rules preserved:** R38, R39, R40, R43.
**Alternatives:** A13, A15, A16.

**Must state:**
- A moves right only.
- B moves down.
- C moves right only.
- D does not move.
- The positions are written by the Open Edit, not at render.
- At least one of the one-axis reasons.

**Must not contradict:**
- "At or past" the collapsed edges, not strictly past the origin (R40).
- Growth is floored at zero (R39).
- A drag lands exactly where dropped, with no conversion (R38).

**Sources:** ADR 0093, ADR 0084 ("The transform"), CONTEXT "Placement", `AGENTS.md` 0084 entry.

## Q8. Closing after the author moved things

> While S is Open, the author drags another Resource R into the space beside S that the Open had cleared. Then they close S. What happens to R, and why? A reviewer suggests remembering which Resources S's Open pushed so Close only moves those back. Should you?

**Expected answer:**
- **What happens to R:** Close reads the Map as it is now. R is clear of S's collapsed rect, so it moves back by the negation of S's growth on its one axis, like every other Resource currently clear of S, even though S's Open never pushed it.
- **Edge case:** If S itself had been dragged past the neighbours its Open displaced, Close reclaims from none of them.
- **S's own size:** S keeps its Open Size for the next Open. Close changes only its state.
- **The reviewer's suggestion:** Reject it. Recording the push set would mean:
  - per-Open stored state;
  - which goes stale as soon as the author moves anything;
  - and makes two Maps with identical positions behave differently because of history neither shows.

  Open and Close are each a Map decision taken at a moment.
- **Round trip:** An Open immediately followed by a Close still restores positions, because growth is never negative.

**Rules preserved:** R41, R42, R44.
**Alternative:** A14.

**Must state:**
- R moves back.
- Close is memoryless, reading current positions.
- Reject recording the push set, with at least the stale-state or history-dependence reason.

**Must not contradict:**
- The one-axis rule (R40).
- Open Size survives Close (R44).
- The round-trip guarantee for nonnegative growth (R42).

**Sources:** ADR 0084 ("Closing reclaims from where things are now", "The transform"), ADR 0093 (paragraph 2), ADR 0066, CONTEXT "Placement".

## Q9. Switching the Graph the author is working in

> You are adding a control that switches which Graph the author is working in on the current Map. Is switching an Edit? What changes on the canvas, where do newly drawn Edges go, and what is persisted, and when?

**Expected answer:**
- **Is it an Edit?** No. Switching the Active Graph is navigation. It submits nothing and is never a side effect of drawing or reading.
- **On the canvas:** The Map still draws every Graph it owns. Only the emphasis moves, so it is emphasis, not filtering.
- **New Edges:** They join the Active Graph.
- **What is persisted:**
  - Nothing at switch time.
  - The choice is recorded only when a later Edit in that Map writes the Map's active Graph explicitly. Until then, a reload reopens on the stored one, or on the Map's first Graph if none is named.
  - Intake rejects a stored active Graph that does not exist or belongs to another Map.
- **Accepted cost:** Activation is not durable until the next Edit.
- **Choosing a Map:** Also navigation, not an Edit. The canvas shows only the selected Map's own Graphs.

**Rules preserved:** R29, R28, R10, R8.
**Alternative:** A18.

**Must state:**
- Not an Edit.
- All the Map's Graphs stay drawn, with only emphasis moving.
- New Edges join the Active Graph.
- Persisted only by a later Edit in that Map.
- The fallback is the first Graph.

**Must not contradict:**
- No filtering (R29).
- No second "selected Graph" concept (R29).
- Intake rejects a dangling or foreign active Graph (R28).

**Sources:** ADR 0028, ADR 0040 (paragraph 3), ADR 0041 ("Authoring, navigation and rendering"), ADR 0079 (paragraphs 2, 5), CONTEXT "Active Graph".

## Q10. A read-only grid view with its own URL

> A product request asks for a read-only "grid view" of a whole Space, with its own URL, so readers can glance at every Resource without anyone curating a Map. Can you build it as asked? If not, what does the architecture offer instead, and why was the requested shape removed?

**Expected answer:**
- **As asked:** No.
  - An authored Map is the only selectable and addressable canvas context.
  - Computed or automatic views were deliberately removed from the domain, persisted selections, URLs and the registry. Obsolete canvas identities are invalid input, and their URLs are not found.
  - Automatic strategies are non-addressable capabilities, and none draws the canvas.
- **Why removed:** Keeping such views dormant would preserve their ids, schema cases, URL semantics, conversion path and renderer resolution, which is most of the complexity the removal exists to eliminate.
- **What the architecture offers:**
  - Put the Resources on a Map, for example a new Map via Add Map, then Add to Map.
  - Arrange them with an automatic arrangement applied as an explicit Edit over that Map (Auto-arrange, accepted but not yet built).
- **What V1 gives up:** The view that showed Graphs flattened across Maps.

**Rules preserved:** R8, R3, R2, R6, R11.
**Alternatives:** A4, A3.

**Must state:**
- Not buildable as asked, because only a Map is a selectable or addressable canvas context.
- Automatic strategies are not addressable.
- The alternative is an Edit over a Map.
- The dormant-complexity reason.

**Must not contradict:**
- Auto-arrange is unbuilt (R6).
- No strategy runs at render except the positioned one (R2).
- Auto-arrange works over an existing Map rather than creating its own (R6).

**Sources:** ADR 0079 (paragraphs 1–2, the rejection paragraph), ADR 0086, ADR 0069 with 0079 (Map URL), CONTEXT "Layout strategy".

---

## Topic coverage

| Pilot topic | Questions |
| --- | --- |
| Authored Map versus automatic arrangement | Q1, Q2, Q10 |
| Listing versus first working load of a mapless Space | Q3 |
| Empty Map creation with an Active Graph | Q4 |
| Explicit Resource membership and removal | Q6 |
| One-axis displacement | Q7 |
| Memoryless Close | Q8 |
| Surviving reason for rejecting an intermediate Arrangement type | Q2 |
| Map ownership of Graphs | Q5 (and Q4) |
| Default Map and last-Map deletion | Q4 (and Q3) |
| Active Graph | Q9 (and Q4, Q5) |

## Ambiguities that affect expected answers

1. **Undo (D12, resolved 2026-10-04: undo is not built and is a planned future feature; every Edit is one atomic unit a future undo reverses whole).**
   - The conflict: ADRs 0086 and 0084 call Auto-arrange and displacement Edits "undoable" as a unit. ADRs 0048 and 0074 and the code say V1 has no undo.
   - This affects: Q1, Q7 and Q8.
   - Acceptable answers:
     - "It is one atomic Edit."
     - "No undo exists in V1."
     - Naming the conflict.
   - Fails: an answer asserting that a working undo command reverses it.
   - The resolution confirms these grades: asserting a working undo today is wrong; "one atomic Edit" and "undo is a future feature" are right.
2. **Room reclaimed on removal (G1, resolved 2026-10-04: a live rule; removal Closes an Open Resource in the same Edit, then removes it).**
   - The gap: R35 is stated by CONTEXT and built, but no ADR states it.
   - This affects: Q6.
   - Acceptable answers: Q6 lists reclaim under "Must not contradict" rather than "Must state", so an answer that omits it can still pass, but one that says the neighbours stay displaced fails.
   - The user confirmed R35 as a live rule. It now belongs under "Must state". All four graded readers stated it in Q6, so no grade changes.
3. **Recording the default Map (D16, resolved 2026-10-04: every Edit in a Map records it as `defaultMap`, Add Map included).**
   - The difference: ADR 0079 says a later Edit "may" record the Map as default. The code always does, including for Add Map.
   - This affects: Q4 and Q9.
   - Acceptable answers: any position consistent with "may" (as graded). Under the resolution, "every Edit records it" is the precise answer. "May" stays acceptable, being less precise rather than wrong. No reader said "never" or "at selection", so no grade changes.
   - Fails: an answer saying selecting a Map is itself an Edit or is persisted at selection time.
4. **Auto-arrange scope details (G6, and Open state).**
   - The gap: No source says whether Auto-arrange respects Open Sizes, which strategy it uses, or whether it records provenance.
   - This affects: Q1 and Q10.
   - Acceptable answers: Q1 and Q10 do not ask about these. An answer that invents a rule for them is recorded as a finding, not a failure, unless it contradicts R6.
5. **Presentation gate for an empty Graph (G2).**
   - The gap: Sourced to CONTEXT and code only.
   - This affects: Q4, where it is stated but not graded as "Must state".

None of these blocks fixing the expected answers for the graded "Must state" items, provided Ambiguity 1 is graded as specified above.
