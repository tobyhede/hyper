# 01: Correct the stale facts in the agent docs

**What to build:** an agent reading AGENTS.md, `docs/agents/*` or the ADR index meets no claim the pre-release audit found false. Each fix states what is true now, in present tense, and replaces a count or a ticket status that drifts on its own with a pointer to the file or ticket that holds it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Findings from the pre-release audit, still open after the release fixes:

- ADR 0064 is marked "being built", but its behaviour is asserted by the e2e and Ladle suites and no open delivery ticket remains. Confirm, then mark it built or name the open ticket.
- AGENTS.md says React Flow specifics live only in `react-flow-adapter`, and a later bullet says `app` imports it legitimately. State the boundary once: no React Flow imports in `core`, `graph`, `persistence` or `ui`.
- The eslint suppression counts disagree (AGENTS.md says 47 sites in 25 files, the anti-slop guide says 79 in 36, the file holds 46). The typing-fixture counts disagree too (the docs say seven must-fail, there are eight). AGENTS.md's coverage-threshold list omits `http`. Point at the files instead of stating numbers.
- The workflow guide's loop tells agents to run `/grilling` and `/improve-codebase-architecture`, and the same guide says that skill pack was removed.
- The rendering guide says structural deletion has no control (Delete from Space is one) and points to an ADR 0040 entry in the editing-and-persistence guide that does not exist.
- The UI guide cites `sidebar.tsx`, which is deleted, as the `#subpath` example.
- The refusal-cascade guide says "two guards common to every action". There is one, `map-not-found`.
- The Maps-and-Graphs provenance table labels R44 "Accepted, not built". R44 is built.
- The editing-and-persistence preamble refers to Reference Resource retargeting text that is no longer below it.
- The workflow guide's "Capture" example uses the ELK port-id collision (ELK is gone). The triage-labels guide ends in template text.
- AGENTS.md names a "repo-meta test" that does not exist. The tests that shell out to `git ls-files` are current-domain-vocabulary, conflict-markers and docs-agents-citation-accuracy.
- The ADR index's lines use retired vocabulary (Card, Layout, Thing, Diagram, Alias, View) with no translation note.
- Two source comments still state the superseded fixed Closed size or resize-only-when-Open: the header of the app's `resource` module and the "Resizing this Open Resource" comment in the adapter's projection.

- [ ] Every item above is corrected or recorded as refuted with its evidence.
- [ ] No prose in the agent docs states a suppression, fixture or coverage count.
- [ ] `docs-agents-citation-accuracy`, `current-domain-vocabulary` and prettier pass.
