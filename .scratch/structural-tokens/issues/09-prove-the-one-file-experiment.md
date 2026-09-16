# 09: Prove the one-file experiment

**What to build:** An alternate token block that restyles the chrome without touching a single component, demonstrating that tickets 02–07 were complete.

This is the verification of the whole effort rather than a novelty. If a surface does not move when the alternate block is applied, that surface is still stating its own geometry and a batch missed it — which is a defect the check in ticket 08 should have caught, and a gap in the check as well as in the batch.

The natural subject is the question that started this work. The Thing is **already** drawn in the neobrutalist idiom — a 4px border, zero radius, and a `7px 7px 0` unblurred offset shadow while dragging — and the chrome is not: 1px borders, 10px radius, a soft two-layer wash. So the live question was never whether to restyle the product. It is whether the chrome should adopt the geometry the Thing already uses, and after this ticket that question is answered by editing one block and looking, instead of by a migration.

Answering it is **not** in scope here. This ticket delivers the ability to run the experiment and the evidence that the experiment is honest. Whether the chrome keeps its own geometry or takes the Thing's is a design decision, and taking it is separate work.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] An alternate token block visibly restyles the chrome with no component file modified
- [ ] Every chrome surface moves under it; any surface that does not is reported as a miss against the batch that should have covered it and against ticket 08's check
- [ ] The Thing does not move under a chrome-only block, confirming the two scales of ticket 06 are genuinely separate
- [ ] The alternate block is left in the tree as evidence, inert, not wired into the running app
- [ ] The design question it makes answerable is written down as a decision still to be taken, not taken here
- [ ] `pnpm verify` and `pnpm e2e` pass and the output is reported
