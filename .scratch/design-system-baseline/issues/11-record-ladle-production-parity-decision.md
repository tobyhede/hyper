# 11 — Record why Ladle has production parity

**What to decide:** Test the branch's production-parity gate against its credible
alternatives, then record the durable decision at the level its trade-off earns.

**Blocked by:** None — resolve before issue 08 treats the gate as settled.

**Status:** ready-for-agent

**Delivery:** The decision and its acceptance work are complete on the donor.
The remaining work is to extract ADR 0052 and reconcile its operational
pointers on a clean branch from `main` with the Ladle-infrastructure delivery.

- [x] Grill unchanged production components in Ladle against the rejected alternatives: a catalogue route, story-only modes, visual facsimiles and lifecycle or geometry substitutes.
- [x] Decide whether the rule is hard to reverse, surprising and a real trade-off under `docs/agents/workflow.md`.
- [x] If it clears that bar, write an ADR that records the rejected alternatives and the catalogue convenience accepted as a cost; otherwise keep the narrow operational rule in agent guidance and record why an ADR was unnecessary in this ticket.
- [x] Reconcile AGENTS.md, the shadcn-first skill, `.ladle/config.mjs` and issue 08 so one source owns the rule and the others point to it rather than restating competing versions.
- [ ] Deliver ADR 0052 and those operational pointers to `main` before Issue 08 treats the parity gate as available.

## Answer

On the donor, ADR 0052 makes stable Ladle stories production-parity evidence.
They render the unchanged exported production component through the smallest
coherent boundary that owns the claimed behavior. Harnesses may supply
environment and public inputs but may not replace state translation, lifecycle,
focus, interaction or framework geometry. Story-only modes and visual
facsimiles are forbidden from stable stories; unreachable and unresolved work
belongs under `stories/review`.

Dual behavioral verification is a hard requirement for every meaningful stable
story claim: one Ladle behavior test and one corresponding real-application
behavior test, connected through explicit mechanically checked traceability.
Issue 08 owns that inventory and enforcement work.

The donor ADR records the rejected application catalogue route and substitute-story
alternatives, plus the accepted costs of a second runtime, more elaborate
harnesses, duplicated verification and excluding states without a production
seam. Its donor versions of `AGENTS.md`, `$shadcn-first-ui` and
`.ladle/config.mjs` point to ADR 0052 at their respective operational boundaries
rather than owning competing rationales; the unchecked delivery criterion owns
bringing that coherent set to `main`.
