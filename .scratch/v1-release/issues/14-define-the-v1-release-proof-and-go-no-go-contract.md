# Define the V1 release proof and go/no-go contract

Status: resolved
Tags: wayfinder:grilling, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: [Decide the V1 execution sequence and critical path](12-decide-the-v1-critical-path.md), [Decide how End-to-end feedback controls V1 scope](13-decide-how-feedback-controls-v1-scope.md)
Assignee: human + agent

## Question

What exact proof closes every V1 Definition of Done line and permits the
`v1.0.0` tag? Assign each claim to executable evidence, observed journey
evidence, documentation or an explicit deferred-scope decision; define how
known defects are classified; and settle the final go/no-go review and tagged
commit requirements.

## Answer

V1 has one binary, commit-specific release gate. Ticket 07 implements it as a
proof matrix with exactly one row for every checkbox in the reconciled
Definition of Done. No checkbox closes without a direct evidence link, a named
owner and an explanation of what the evidence proves.

The pending Layout-only reconciliation must complete before the matrix is
populated. A retired Computed View or Space View claim is corrected in the
Definition of Done; it is never proved, waived or silently deferred.

### Proof matrix contract

Each row records the Definition-of-Done claim, owner, candidate commit, overall
result and any linked defect or accepted deferral. It carries one or more typed
evidence entries, each with its own class, link and result, so one checkbox can
require executable, observed and documentation proof without becoming several
matrix rows. The four permitted evidence classes are:

1. **Executable** — a named automated test, suite or reproducible command.
2. **Observed** — a recorded step in the supported clean-clone canonical
   journey.
3. **Documentation** — inspection of the candidate commit's README or supported
   setup instructions.
4. **Accepted deferral** — a direct link to an explicit V1 scope decision.

One artifact may support several rows, but every row explains its own claim.
A bulk link saying only that a suite passed is not sufficient. An open ticket,
absence of implementation or an undocumented waiver is not accepted-deferral
evidence.

The Definition-of-Done sections receive these required proof combinations:

| Claims | Required proof |
| --- | --- |
| Spaces and persistence | Executable domain/application tests plus HTTP and PostgreSQL integration. Initialization and destructive recovery also appear in the final observed journey. |
| Cards, Markdown Cards, Alias Cards and Space Cards | Executable application and Chromium evidence for every operation and refusal. The final observed journey covers one successful path through all three kinds. |
| Layouts, Graphs and Edges | Executable application and Chromium evidence for lifecycle, ownership, selection and valid graph shapes. The final observed journey covers successful management and presentation of its authored Layout and Graph. |
| Presentation | Executable Chromium evidence for pointer and keyboard traversal, including forks, Back, cycles and self-Edges; the final observed journey proves the recovered Graph presents. |
| URL addressing | Executable HTTP/application/Chromium evidence for canonical and contextual resolution, History, reload, copy-link meaning and 400/404 policy. |
| Product design and accessibility | Ladle and application parity evidence, automated accessibility and interaction checks, and final observed desktop and narrow-screen use where automation cannot establish usability. |
| Release gate | Exact command records, PostgreSQL integration, the final observed journey, the classified defect register, README inspection and the recorded go/no-go decision. |
| V1 scope decisions and deferred work | Direct links to the accepted decision that includes or defers each item. |

Observation does not replace executable proof where the repository promises a
gate. Documentation closes only documentation claims. Accepted deferral cannot
close a capability that remains in the V1 contract.

### Candidate evidence

The automated evidence is produced from the candidate commit on the required
Node version and records the full commit SHA, environment, command, result and
artifact or log reference. At minimum it includes:

- `pnpm verify`;
- `pnpm e2e`;
- `pnpm e2e:ladle`; and
- the complete PostgreSQL integration proof, including an Edit surviving a
  fresh host and the destructive export → reset → import recovery path.

The PostgreSQL run begins from controlled derived state and finishes with
PostgreSQL stopped. Required commands must pass on their first recorded attempt.
A retry that passes is feedback under ticket 13, not a green gate; retain the
failure artifact and classify the underlying defect before another candidate
run.

Evidence is valid only for the exact candidate commit, or for an ancestor when
the files relevant to that claim are demonstrably unchanged. Any amendment to
the candidate invalidates affected evidence. Every required gate reruns on the
final candidate SHA.

### Final observed journey

After all accepted End-to-end feedback work, one technical author performs a
fresh complete clean-clone canonical-journey rehearsal on supported macOS or
Linux with desktop Chromium. This is a final release rehearsal, not reuse of the
earlier End-to-end checkpoint result. One supported manual environment is
sufficient; V1 does not require a complete OS/browser matrix.

The observed record contains the date, operator, supported OS, Chromium
version, candidate SHA, result and links to the compact manifest and artifacts.
It contains no credentials or repository secrets. UI and usability claims may
combine this observation with automated behaviour and accessibility evidence.

After any accepted blocker work or correction, rerun the affected step and all
dependent steps. The complete clean-clone rehearsal runs again on the final
candidate before the go/no-go review.

### Known-defect register

Every known defect is recorded with its ticket 13 evidence, classification,
owner and disposition. Several symptoms with one root cause share one entry;
independent defects remain separate. A defect without a classification is an
automatic no-go.

An unresolved V1 blocker or accepted-but-incomplete correction is an automatic
no-go. A known post-V1 defect may ship only with its rationale and owner
recorded. No waiver can override a failed required command, incomplete matrix
row, missing recovery proof or unresolved blocker-class defect. Changing one of
those conditions requires an explicit release-contract amendment and a new
candidate review.

### Go/no-go and tag

The final record names the matrix revision, candidate SHA, command results,
observed rehearsal, defect register, decision, decision-maker and timestamp.
The human directing V1 is the accountable decision-maker. Agents may assemble
and audit evidence but cannot authorize the release.

The result is binary. **Go** requires every matrix row closed, all required
commands green, the final rehearsal green, no unclassified defect, no unresolved
blocker-class defect and no incomplete accepted correction. Resolved blockers
remain in the register with their correction and reproof evidence. Anything else
is **no-go**.

After a recorded go, create annotated Git tag `v1.0.0` on the exact approved
commit and verify that `v1.0.0^{commit}` resolves to its full SHA. A mismatch,
post-review commit or candidate amendment cancels authorization and requires a
new review. The candidate is proved from a clean clone or worktree with all
intended tracked changes committed; unrelated files in another local worktree
do not contaminate it.

This contract does not require package publication, hosted deployment, a
GitHub Release, a signed tag or a broader manual platform matrix.
