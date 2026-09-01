# Decide how End-to-end feedback controls V1 scope

Status: resolved
Tags: wayfinder:grilling, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: [Define the End-to-end checkpoint](11-define-the-end-to-end-checkpoint.md)
Assignee: human + agent

## Question

What repeatable triage rule turns observed End-to-end feedback into a V1
blocker, an in-scope correction or post-V1 work? Define the evidence required to
claim that feedback materially undermines the canonical journey, who makes that
call, and how accepted scope changes alter the Definition of Done and critical
path without silently expanding the release.

## Answer

End-to-end feedback enters V1 through one conservative, evidence-backed gate.
An observation receives exactly one disposition:

1. **V1 blocker** — supported clean-clone use reproducibly cannot complete the
   canonical journey, or the result cannot be trusted because authoring,
   persistence, reload, import/export, recovery or presenting is incorrect or
   risks authored state.
2. **In-scope correction** — the supported journey is materially degraded, but
   the existing release contract can be restored with a bounded correction and
   no new product capability.
3. **Post-V1** — the observation is cosmetic, preferential, additive, confined
   to an unsupported environment or not yet supported by sufficient evidence.

A workaround does not excuse a blocker when it requires source or stored-format
knowledge, departs from the documented journey or risks authored state. A safe,
documented workaround available through the supported interaction model may
make an otherwise completable defect an in-scope correction. Flaky feedback
blocks only when repeated attempts establish a credible release risk; until
then, retain the observation and its evidence as post-V1 work. Unsupported-
platform feedback remains post-V1 unless it demonstrates a platform-independent
defect.

Accessibility feedback blocks when it prevents the required desktop Chromium
journey through the supported interaction model. Broader accessibility work
continues through its existing owners and does not enter V1 merely because it
was observed at End-to-end.

## Required evidence

Every classification records:

- the canonical checkpoint step and acceptance criterion affected;
- the expected and observed result;
- the supported environment and exact reproduction attempt;
- the smallest useful artifact, log or screenshot supporting the observation;
- whether repetition reproduced the result and whether a safe workaround
  exists; and
- the disposition, owning ticket and concise rationale.

Several symptoms with one root cause become one correction. One observation
that reveals independent defects is split across their real owners.

## Authority and change control

The human directing the V1 release is its accountable release owner: they make
the final classification, confirm every scope expansion and resolve any
disagreement. An agent may assemble evidence and recommend a disposition but
cannot finalize one. Ambiguous feedback defaults to post-V1 until stronger
evidence exists; silence never counts as acceptance or as disposal of a known
defect. The final decision and rationale are recorded in the proof matrix.

Before implementation begins, accepted blocker or correction work must:

- update exactly one owning ticket rather than hiding work in the rehearsal;
- update the existing Definition-of-Done acceptance and proof mapping when a
  correction changes its proof;
- amend the relevant Definition-of-Done acceptance statement and its proof
  mapping when an explicitly accepted expansion adds capability;
- update the critical path when ordering or blockers change; and
- appear in the release evidence with its classification and rationale.

The correction is the smallest change that restores the confirmed contract.
Adding a capability requires an explicit reopening of scope rather than being
described as a correction.

## Reproof and closure

After any accepted V1 blocker work or in-scope correction, rerun the affected
checkpoint step and every dependent step. The complete clean-clone rehearsal
still runs before `v1.0.0`. The feedback window closes at the go/no-go review:
later blocker-class evidence reopens the gate, while later feature requests
target post-V1.

Known non-blocking defects remain visible in the release evidence and may ship.
No known defect may ship when this rule classifies it as threatening authoring,
persistence, reload, import/export, recovery or presenting.
