# Code/glossary divergences are not being recorded

Status: resolved

## Context

`docs/agents/workflow.md` states the practice:

> Code should speak the glossary's vocabulary. Where it doesn't yet, AGENTS.md
> records the divergence as a gotcha and the tracker carries a ticket to close it.

A live instance ran for a long time with neither. `CONTEXT.md` listed **placement**
under Layout's `_Avoid_` line, while the code said `installPlacement`,
`authoredPlacement`, `usePlacementRendering`, `PlacementRenderingState` and
`samePlacement`, and `AGENTS.md` itself said "Placement is authored, and no engine
owns it". Nothing recorded the disagreement, so it was rediscovered from scratch
during the Placement review, at the point of naming a module.

That one is closed — `f1936c0` added a **Placement** glossary entry and narrowed
Layout's `_Avoid_` line to say placement is the map, not the entity holding one.
The practice around it is not in place, so the next divergence will also go
unrecorded.

## Why this is a human ticket

The question is a process one, not a code one: is the `_Avoid_` list meant to be
enforced against the code, or is it advisory for prose and naming? Both are
defensible. If enforced, an audit is worth doing once and a check is worth having.
If advisory, `workflow.md`'s sentence should say so, because as written it promises
a record that does not exist.

## Resolution

Treat `CONTEXT.md`'s `_Avoid_` entries as authoritative for domain-significant
identifiers, applied semantically rather than as a mechanical forbidden-word
list. Code should use the glossary's vocabulary when a term names a domain
concept. A contextually valid use of the same word is not a divergence merely
because the word also appears under `_Avoid_`.

When code cannot yet conform, record the intentional mismatch as a gotcha in
`AGENTS.md` and carry a tracker ticket that closes it. Accidental divergences
found during review should likewise become tracker tickets rather than being
left for the next review to rediscover.

Audits should therefore inspect the remaining `_Avoid_` entries against
domain-significant identifiers in `packages/*/src` and judge each use in
context. Do not implement this policy as a crude text-denylist check. Placement
is already clean after `f1936c0`; the term now has an explicit glossary meaning
and no longer constitutes a divergence.
