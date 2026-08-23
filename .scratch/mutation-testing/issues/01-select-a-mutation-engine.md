# 01 — Select a mutation engine through a compatibility bake-off

**What to build:** Establish which mutation engine can reliably exercise this repository by running disposable StrykerJS and mewt spikes over a small representative part of SpaceSession. Retain a narrow, repeatable command and configuration for the better engine, and remove the losing spike completely.

**Blocked by:** None — can start immediately.

**Status:** resolved — StrykerJS selected; see `../engine.md`.

- [x] Both engines complete a representative dry run or sample campaign against the intended Vitest tests without requiring source compromises.
- [x] The comparison records Vitest correctness, TypeScript 7/6 toolchain compatibility, mutant targeting, report usefulness, runtime, and configuration burden.
- [x] The winner is chosen in that priority order rather than by raw mutant count, since engines need not generate equivalent mutant sets.
- [x] Only the selected engine, a narrowly scoped configuration, and a repeatable package command remain; the losing dependency, configuration, cache, and reports are removed.

