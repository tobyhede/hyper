# 20 — The Create dispatch names every Thing kind

Status: ready-for-agent
Tags: release/v1
Blocked by: nothing.

**What to build:** adding a third Thing kind to the Dock's Create cluster fails
to compile until someone says what pressing it does, instead of quietly creating
a Space Thing.

## Why

The Dock hands its Create presses to one dispatch, and that dispatch is written
as a two-way fall-through: markdown takes the first arm and *everything else*
takes the second. `THING_KINDS` is the list the cluster draws its controls from,
so a kind added there gets a control, a glyph, an accessible name and a press
that silently runs the Space Thing lifecycle.

Every neighbouring outcome switch in the same module is deliberately written the
other way — each arm named, "so the compiler asks again the day a fifth joins
the union". This one is the exception, and there is no reason recorded for it
being one.

It is small, and it is worth doing while the reason it matters is fresh: ADR 0089
is the decision that made every kind complete on activation, and the negative it
records — *"a fourth kind that genuinely cannot is a decision refining this
one"* — is exactly the moment this fall-through would be read as an answer.

- [ ] A kind added to `THING_KINDS` with no dispatch arm is a type error
- [ ] The existing two kinds behave exactly as they do now
- [ ] `pnpm verify` green; `pnpm e2e` if the surface changes
