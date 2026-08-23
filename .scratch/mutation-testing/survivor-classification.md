# Survivor classification — the shared vocabulary

Every mutation campaign in this stack classifies each **surviving** mutant into exactly one of five categories. Tickets 02 and 04 use this same list so the SpaceSession baseline and the graph-intake control can be compared honestly.

A survivor is a mutant the campaign applied and the oracle did not kill. Killed mutants are counted but not classified.

## 1. Meaningful behavioural gap

The mutant changes behaviour a caller of the public surface could observe, and no test asserts it. This is the only category that earns a new test.

The bar: state, in one sentence, the observable difference — a snapshot, a revision, a persistence state, a notification count, a recorded backend call, a returned error — that a caller would see and the suite does not check. If you cannot write that sentence, it is not this category.

## 2. Equivalent or unobservable variation

The mutant produces behaviour indistinguishable through the public surface. Three common shapes:

- **Truly equivalent** — the mutated program computes the same thing (a redundant guard removed, a defensive clone dropped where the value is never mutated afterwards).
- **Unobservable through the seam** — the difference exists but only in private state the interface deliberately does not expose.
- **Observable only via identity, not value** — e.g. dropping a `structuredClone` where every assertion is by value. Note these separately in prose; they are a *design* signal (the seam does not promise isolation) rather than a test gap.

These are documented, never killed with an artificial assertion.

## 3. Wider-suite concern

The mutant is a real behavioural change, but the behaviour belongs to a different test's subject — a collaborator's contract, an integration path, or a boundary the targeted test file is not the oracle for. Killing it here would put the assertion in the wrong place.

Record where the assertion *should* live. Do not add it in this campaign unless the correct home is the same file.

## 4. Timeout

The mutant made the test run exceed the runner's per-mutant timeout rather than fail. Usually an infinite loop or an unresolved promise.

A timeout is normally reported as *killed* by the engine, but a timeout that the engine reports as *survived* — or one where the timeout is an artefact of a too-tight budget rather than of the mutation — is a campaign-configuration fact, not a test-quality fact. Record it as such.

## 5. Tooling problem

The mutant survived for a reason that is about the engine, not about the code or the tests: an invalid mutant that does not compile and is scored as a pass, a mutant in code the runner never loaded because of module resolution, a runner that reported success on a crashed process, a report entry that cannot be traced to a source location.

These bound how much the campaign's headline number can be trusted, and they are the evidence that decides adoption in ticket 04.

## Recording rules

- Classify **every** survivor. An unclassified survivor is an unfinished campaign.
- Mutation score is recorded as diagnostic evidence only. It is never a target, a threshold, a CI gate, or a `verify` gate.
- Engines do not generate equivalent mutant sets, so scores are not comparable across engines. Compare the count of category-1 findings and the review effort spent reaching them.
