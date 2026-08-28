# 08 — Amend and accept ADR 0068, and reconcile issues 01 and 03 onto it

**What to build:** ADR 0068 is `proposed` and says it is "provisional until the Space Card UX is exercised". The prototype exercised it. Amend it with what that produced, accept it — which supersedes 0055, 0058, 0059 and 0060 — and rewrite the two Space Card tickets that were written against the model it replaces.

**Blocked by:** none. Issue 07 is resolved.

**Status:** resolved

- [x] ADR 0068 records the model in an **Open Spaces** section: persistent entries, one per open Space, where selecting switches and closes nothing and Exit is an explicit command. It says outright that this withdraws its own "Back or Escape returns to the containing Space" rather than leaving both sentences standing.
- [x] ADR 0068 records that **Enter is exempt from the compound canvas**. The entered Space gets its own React Flow instance and camera and is edited as if opened normally; the compound-canvas preference scopes to the embedded open-Card case, which the ADR does not currently say.
- [x] ADR 0068 resolves the selection-ownership question 07 answers, in one place rather than two paragraphs that disagree.
- [x] ADR 0068's status becomes `accepted`, and 0055, 0058, 0059 and 0060 are marked superseded by it.
- [x] ADR 0053 is refined: the sidebar area holds **Open Spaces**, which is the session's, beside one **Space Sidebar per open Space** — and each of those stays that one Space's command surface, composed exactly as the application composes one today, with only the active one showing (issue 09). The Sidebar does not become the session's; the surface beside it does. Open Spaces costs no canvas width because it comes out of `SIDEBAR_WIDTH` rather than adding to it — which is the price ADR 0053 already accepted. Below the breakpoint the Sheet is a fixed width with nothing to its left, so Open Spaces has to come out of the panel there whatever the desktop does.
- [x] The persistence rules are carried by ADR 0068's "Persistence across open Spaces" section, which **refines** ADR 0057 — the refiner states the refinement, which is the convention `adr-status-blocks.test.ts` enforces. Three rules, not two: switching awaits any in-flight commit; a conflict dialog waits until you switch to the Space that owns it, and the entry carries the mark; and Exit waits, refuses on `failed`/`conflicted`, and warns-and-allows on `rejected`.
- [x] Issue 03 is rewritten against the reference model. It currently requires ownership, atomic target provisioning, cascading deletion and a recursive-Space repository operation, all from ADR 0058. ADR 0068 reverses the first three: the reference is not ownership, the target exists independently, deleting a Space Card never deletes its target, and deleting a Space is a separate operation refused while any Space Card still references it. What survives is the `space` kind, the Card's own selection fields, cycle rejection at intake, and import/export round-tripping the kind.
- [x] Issue 01 is rewritten or closed against the same model, and its `needs-triage` status resolved either way.
- [x] Issue 04 is checked against the same model. Its argument for relinking import — that a stored Space would otherwise be unreachable — rests on ADR 0058 making a Space Card the *only* path to a Space. ADR 0068 says a Space "remains directly loadable as a root when no Space Card references it", so the orphan case it closes may no longer exist. Retiring the chooser stands on its own either way; the import criterion is the one to re-take.

## Why this blocks everything else

Issue 03 is currently `ready-for-agent` and describes the superseded model in detail, including a repository operation ADR 0068 does not need. An agent picking it up would build the wrong thing carefully. Nothing downstream of 03 should start until this lands.

## Evidence to draw on

The review stories under `packages/app/stories/review/` carry the design in their module comments, including which parts are the user's rulings and which were guesses. They are the record of what the prototype settled; delete them when the surface lands (issue 11), not before.

## Comments

### Resolved

ADR 0068 is `accepted`. It gains `Supersedes: 0055, 0058, 0059, 0060` and `Refines: 0053, 0057`; 0053 and 0057 answer with `Refined by: 0068`, and the four superseded ADRs each answer with `Superseded by: 0068` — one superseder apiece, which is the cardinality `test/unit/adr-status-blocks.test.ts` enforces. That test passes.

Two sections are new: **Open Spaces**, carrying the surface, the naming, the entry that remembers nothing and the Enter-on-already-open rule; and **Persistence across open Spaces**, carrying the three rules that refine ADR 0057. Four existing paragraphs were amended in place — the provisional header, the Card-ownership paragraph (which gains the live navigation context without reversing anything it already said), the new-tab sentence, and the Back-or-Escape clause, now withdrawn by name. `Enter is exempt from that preference` was added to the UX prototype section.

`CONTEXT.md` gains **Entering** and **Open Spaces** as glossary entries with their avoid-lists, and its Opening entry now says a Space Card opens on the Space View it selects rather than "its nested Graph", which is what the accepted ADR says.

Tickets reconciled: 03 rewritten (four ADR 0058 criteria dropped, including the recursive-Space repository operation — the note explains why no multi-Space transaction is needed now); 01 rewritten from `needs-triage` to `ready-for-agent` as the compound-canvas sub flow; 04's import criterion withdrawn and the ticket unblocked, since ADR 0069's addresses close the orphan case on their own; 09 and 11 rewritten onto the settled vocabulary and renamed; 12 given the Exit rules and the `rejected` asymmetry.

The grilling that unblocked this is recorded in issue 07.
