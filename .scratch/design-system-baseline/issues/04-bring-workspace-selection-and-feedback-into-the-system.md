# 04 — Bring workspace selection and operational feedback into the system

**What to build:** Present choosing a Space and receiving operational feedback through shared design-system surfaces, including empty, busy, failure and persistence-refusal states.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] A Space choice is a clear reusable item/card treatment, including a usable loading state and an intentional empty state.
- [ ] Startup, workspace and placement failures use a common accessible alert treatment without losing their diagnostic detail.
- [ ] Ladle renders the actual chooser and feedback states rather than representative markup.

## Audit note

The current chooser story documents the production gaps rather than closing
them: rows remain bare buttons, the empty state is a heading over a void, and
the busy state has no visible progress. Treat that story as evidence of the
work still required, not acceptance of the surface.
