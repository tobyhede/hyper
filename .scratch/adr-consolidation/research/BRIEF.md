# Shared brief for ADR cluster analysts

Repo: /Users/tobyhede/.herdr/worktrees/hyper/feat-knowledge-spaces (READ-ONLY for you — do not edit anything in the repo). Write output only to the scratchpad dir: /private/tmp/claude-501/-Users-tobyhede--herdr-worktrees-hyper-feat-knowledge-spaces/5a05fe34-89dd-45f2-8f74-9ebdb8c9d2a9/scratchpad/adr/

Context: ~108 ADRs in docs/adr (84 live incl. 1 rejected, 24 in docs/adr/superseded). Accepted ADRs are append-only; the domain was renamed several times (Card→Thing→Resource, Layout→Diagram→Map, Route→Graph, Alias→Reference Thing→Reference Resource; View removed by ADR 0079). Current vocabulary is in CONTEXT.md. docs/adr/README.md has one "binds" line per ADR. Status blocks carry Refines/Refined by/Renames/Renamed by/Supersedes/Superseded by. The user's hypothesis: older ADRs now contain more obsolete/superseded material than live decisions, so they are noise; a consolidated set describing the current design may be better.

Your job, for each ADR in your cluster:
1. Read it fully, plus whatever refines/supersedes it, and check the code (grep packages/, src/) enough to judge whether each claim still holds.
2. Break the body into claims/paragraphs and classify each as:
   - LIVE: a decision that still binds current code/design
   - STALE-VOCAB: live decision, but stated in retired words
   - OVERTAKEN: decision changed/removed by a later ADR (name it) or by code
   - HISTORY: context, narrative, rejected alternatives, costs-accepted, ticket chatter
3. Record approx word share of each class (percentages summing to 100), the count of distinct LIVE decisions (one line each, in CURRENT vocabulary), and a verdict: KEEP (mostly live) / CONSOLIDATE (live nucleus buried) / ARCHIVE (little or nothing live) / ALREADY-SUPERSEDED.
4. Note where the live rule actually lives today if not in the ADR (CONTEXT.md, docs/agents/*.md, a test, AGENTS.md).

Then for the cluster as a whole:
5. Draft the outline of a consolidated "current design" document for this cluster: the list of live decisions in current vocabulary, each with the ADR numbers it derives from and the test/code that holds it. Target: what a new agent must know, nothing historical. Estimate its word count vs the combined word count of the source ADRs.
6. List contradictions or drift you found (ADR says X, code/CONTEXT says Y), and superseded/rejected ADRs still cited as live outside docs/adr.

Output: write <cluster>.md to the scratchpad dir with a table (ADR | words | LIVE% | STALE-VOCAB% | OVERTAKEN% | HISTORY% | #live decisions | verdict | where rule lives now), then the per-ADR live-decision lists, then the consolidated outline, then drift. Also write <cluster>.json: array of {adr, words, live, stale_vocab, overtaken, history, live_decisions:[...], verdict, notes}. Your final message: a ≤250-word summary with the key numbers and the 3 most striking findings. Estimates are fine but be honest about them; do not invent code facts you didn't check.

Precomputed mechanical data (word counts, status, links) is in mech.json in the scratchpad dir; cites.txt has per-ADR "files citing outside docs/adr and .scratch" and "files within docs/adr".
