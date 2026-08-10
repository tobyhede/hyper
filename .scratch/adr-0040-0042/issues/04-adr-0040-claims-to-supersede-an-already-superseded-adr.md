# ADR 0040 claims to supersede an already-superseded ADR

Status: resolved

Surfaced by: review of PR #39

## Context

ADR 0040's status block reads `Supersedes: 0022, 0026`.

ADR 0022 already reads:

```text
Status: superseded
Superseded by: 0026
```

The repository has no agreed convention for an ADR whose claims are retired by
multiple later decisions. 0022's block names only 0026, while 0040 also claims
to supersede it. So the two disagree, and a scan of the status graph reports it
as an asymmetry:

```text
0040 Supersedes 0022, but 0022 does not list 0040 under "Superseded by"
```

Both readings are arguable, which is why this is a decision rather than a
repair. 0022's subject was a Layout filtering Space-level Routes and marking one
active. 0026 superseded it on the *active* half. ADR 0040 kills the *filter*
half outright, so it does retire something 0026 left standing.

## Direction

Pick a convention and make both blocks agree:

- **Adopt one superseder per ADR.** Treat supersession as transitive for a
  reader following the chain, and drop 0022 from 0040's `Supersedes:` because
  0026 had already superseded it.
- **Allow multiple superseders.** Keep 0022 in 0040's `Supersedes:` and write
  `Superseded by: 0026, 0040` on 0022 to record the two-stage retirement. This
  introduces the repo's first multi-superseder block and establishes that
  convention.

The first unless there is a reason to prefer the second.

## Note

Two further asymmetries exist on `main` and predate this work: `0007 Refines
0003` with no answering entry on 0003, and `0016 Refines 0010` with none on
0010. See issue `05`.

## Acceptance

- 0040 and 0022 agree about what supersedes 0022.
- A status-block scan reports no `Supersedes`/`Superseded by` asymmetry
  involving 0040.

## Answer

**One superseder per ADR**, the recommended option. 0040's line now reads
`Supersedes: 0026`, and 0022 keeps `Superseded by: 0026` unchanged. The chain is
0022 → 0026 → 0040 and a reader follows it one hop at a time.

Three things in the tree argue for it beyond it being the ticket's preference,
and none argued against.

The convention is already the de-facto one. A scan of all 42 ADRs finds ten
superseded documents and every one of them names exactly one superseder; 0040's
line was the only place a second was implied. Taking the other option would have
made this the tree's first multi-superseder block for a single case.

`workflow.md`'s status-block template distinguishes the two shapes on purpose.
`Superseded by: 0009` is written singular while `Refined by: 0005, 0006` is
written plural — refinement accumulates, supersession replaces.

The chain loses nothing, which was the real risk. 0022 carried two halves, and
the ticket is right that 0026 retired only the active one. But 0026 does not
drop the filter half — it restates it under "What survives from 0022", including
the filter/emphasis split and the one-way dependency, and 0040 then kills the
filter outright. So a reader landing on 0022 is sent to 0026, finds the surviving
half restated there rather than merely referenced, and is sent on to 0040. The
transitive reading is complete because 0026 did the carrying work; nothing
depends on 0022 pointing at 0040 directly.

**Scan result: zero non-exempt directed-relation asymmetries**, down from the
single pre-existing one, which was this ticket's. Not zero asymmetries outright:
ADR 0016's one-way `Refines 0010` remains, exempted by issue `05` because a
rejected ADR announces nothing on the decision it proposed to refine. Run over
`Supersedes`, `Superseded by`, `Refines` and `Refined by`, honouring the
spellings issue `05`
catalogued — the inline `Status: superseded by ADR NNNN` that 0019 and 0029 use,
`Supersedes: none` on 0007, and the rejected-ADR exemption for 0016. The scan
was a throwaway; the committed guard is
`test/unit/adr-status-blocks.test.ts`.

## Note

**The convention is enforced, not merely written down.**
`test/unit/adr-status-blocks.test.ts` parsed both supersession spellings and
deliberately withheld the reciprocity assertion, its comment naming this ticket:
"a guard that forced either answer would decide it by accident … adding the
assertion is a one-line change once that decision lands." That decision has now
landed, so the assertion is part of this change: `supersedesFaults` and
`supersededByFaults` sit beside the refinement pair and take the same
rejected-ADR treatment. The tree already satisfied both directions, including
0019 and 0029 answering 0030 through the inline spelling alone.

The guard that matters most is the one pinning the decision rather than the
tree's current state: a synthetic two-stage retirement — 0040 naming both 0022
and 0026 while 0022 names only 0026 — is reported as a fault, so the convention
cannot drift back without a red test.

The ticket's note about two pre-existing asymmetries is now stale in a way worth
recording: issue `05` resolved both. `0007 Refines 0003` was repaired — 0003
reads `Refined by: 0007, 0012, 0032, 0040, 0041`. `0016 Refines 0010` was
deliberately left one-way and exempted in the guard, because 0016 is the tree's
only `Status: rejected` ADR and a live decision must not point a reader forward
at a discarded one. Neither is outstanding.
