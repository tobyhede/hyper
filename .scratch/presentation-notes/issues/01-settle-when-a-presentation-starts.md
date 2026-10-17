# 01: Settle when a presentation starts

**What to build:** A presentation starts when presenting begins from the overview, and also when a reopening while presenting moves to a different Map or Graph. It ends when presenting is left. Reopening a Resource of the same Map and Graph while presenting stays inside the same presentation; browser Back and Forward through the talk's history are that case. The rule is written down once, and the rehearsal notes, the talk timer and the presentation link all follow it. Today the spec says the rehearsal notes start off on every `present` *and* every `openPresentation`, while the code resets them only when presenting turns on or off, and the link keeps its identity even when a reopening changes Graph, so the documents and the code disagree.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec:** `.scratch/presentation-notes/spec.md`. **Context:** ADR 0129, which does not yet state this rule. **Decisions:** on 2026-10-17 the user chose that Back mid-talk keeps the rehearsal notes showing. On the same day they chose that a reopening which changes Map or Graph starts a new presentation, because it is a different talk.

- [ ] ADR 0129 states when a presentation starts and ends, with the same-Map-and-Graph rule for reopening.
- [ ] The places that restate the old reset say the new rule: the spec's "Rehearsal notes" item, the rehearsal notes paragraph in `docs/agents/rendering.md`, and the comment on `useRehearsalNotes`.
- [ ] A test proves the rehearsal notes stay shown across a reopening of the same Map and Graph while presenting, and start off after leaving presenting and presenting again, and after a reopening that changes Graph.
- [ ] A test proves the talk timer and the presentation identity the Notes window follows carry on across a reopening of the same Map and Graph, and change on a new presentation, including one started by a change of Graph.
- [ ] An application test proves browser Back mid-talk keeps the rehearsal notes shown and the Notes window following.
