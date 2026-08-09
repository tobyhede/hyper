# ADR 0040 claims to supersede an already-superseded ADR

Status: ready-for-human

Surfaced by: review of PR #39

## Context

ADR 0040's status block reads `Supersedes: 0022, 0026`.

ADR 0022 already reads:

```
Status: superseded
Superseded by: 0026
```

An ADR cannot be retired twice by different decisions, and 0022's block names
only 0026. So the two disagree, and a scan of the status graph reports it as an
asymmetry:

```
0040 Supersedes 0022, but 0022 does not list 0040 under "Superseded by"
```

Both readings are arguable, which is why this is a decision rather than a
repair. 0022's subject was a Layout filtering Space-level Routes and marking one
active. 0026 superseded it on the *active* half. ADR 0040 kills the *filter*
half outright, so it does retire something 0026 left standing.

## Direction

Pick one and make both blocks agree:

- **0040 supersedes only 0026.** 0026 had already superseded 0022, and
  supersession is transitive for a reader following the chain. Drop 0022 from
  0040's `Supersedes:`. Simplest, and keeps one superseder per ADR.
- **0022 is superseded by both.** Write `Superseded by: 0026, 0040` on 0022.
  Honest about the two-stage retirement, but introduces the repo's first
  multi-superseder block, so it sets a convention.

The first unless there is a reason to prefer the second.

## Note

Two further asymmetries exist on `main` and predate this work: `0007 Refines
0003` with no answering entry on 0003, and `0016 Refines 0010` with none on
0010. See issue `05`.

## Acceptance

- 0040 and 0022 agree about what supersedes 0022.
- A status-block scan reports no `Supersedes`/`Superseded by` asymmetry
  involving 0040.
