# 05: Reduce the lizard TypeScript span defect to a minimal repro

**What to build:** a minimal, synthetic reproduction of lizard mis-spanning TypeScript functions, and a decision on reporting it upstream.

ImpactGate takes each function's line span from lizard and trusts it, so a mis-span becomes a wrong CC in the report's "Top cost drivers" table. Ticket 04 found two cases on this repo with lizard 1.23.0:

- `packages/app/src/components/CommandDock.tsx`: `ResourcesTrigger` (lines 1285–1293, no branches) is spanned 1285–2785 at CC 92. Parsing from line 237 onward spans it correctly, and parsing from line 236 (`export interface DockChrome {`) reproduces the failure.
- `packages/app/src/space-authoring.ts` at PR #267's head: `deriveCompletedEdit` (943–1463) is ended at 1116, where the nested `const writeMap = (write: (map: Map) => Map): void => {` begins, and reported at CC 30.

No tracked issue covers this. lizard #331 "TSX Support" is closed, and ImpactGate's tracker has nothing on spans. This is also the first of the two conditions ticket 04 sets for reconsidering a gate.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A synthetic repro that shares no code with this repo, as small as it will go, showing a wrong span under lizard 1.23.0. It should cover both shapes if they turn out to be separate causes: an interface derailing a later function, and a function-typed parameter annotation ending a span early.
- [ ] The repro is checked against lizard's latest release, and the result is recorded here.
- [ ] Filing upstream on lizard, and optionally a companion issue on ImpactGate about trusting spans unchecked, is decided by a human before anything is posted. Filing is outward-facing.
