# Rescued ADR drafts

Two ADR drafts recovered from the `prototype/space-cards` worktree
(`.worktrees/space-cards`) before it was removed on 2026-09-02. They were
**untracked** files — written 2026-08-29/30, never committed, so they existed
only in that worktree's working directory and no git object held them.

Both carry `Status: accepted` in their own front matter, but neither decision is
in `main`: no ADR in `docs/adr/` states either one under any number or wording,
and `docs/adr/README.md` does not index them.

## The numbering is stale

Their filenames claim 0075 and 0077. Both numbers were taken by other decisions
while these sat uncommitted:

| Draft claims | `main` now has |
| --- | --- |
| 0075 ADRs bind UI semantics, not UI treatment | 0075 Computed Views are read-only and Create Layout converts — itself now superseded by 0079 and filed under `superseded/` |
| 0077 Canonical import and export cover one Space aggregate | 0077 The Meta Space starts from one replaceable default aggregate |

`main` is at 0080. A number vacated by supersession is not free: 0075 keeps
naming the decision it always named, from `superseded/`. Landing either draft
means giving it the next unused number, reconciling its `Refines:`/`Related:`
lists against the current corpus, writing the reciprocal `Refined by:` entry
into every ADR those lists name — `test/unit/adr-status-blocks.test.ts` fails
until each points back — and adding a row to `docs/adr/README.md`.

## What they say

- **ADRs bind UI semantics, not UI treatment** — a process ADR constraining what
  an ADR may bind: authored state and its ownership, cross-module coordination,
  persistence and atomicity, stable domain outcomes. Refines 0053, 0064, 0065,
  0066, 0068, 0073. It writes down a rule the repository appears to follow but
  has never recorded.
- **Canonical import and export cover one Space aggregate** — specifies the CLI
  importing and exporting the complete Meta-rooted Space aggregate and its
  repository-friendly directory format. Refines 0030, 0074. The only export ADR
  in `main` is 0030, and `.scratch/v1-release/issues/08-round-trip-multi-space-import-and-export.md`
  is still open, so this ground is unsettled.

Two sibling drafts (0074 *Ordinary Spaces live while referenced* and 0076 *The
Meta-rooted Space aggregate commits as one change set*) were deliberately not
rescued: `main`'s 0074 and 0076/0078 land the same decisions in rewritten form.
