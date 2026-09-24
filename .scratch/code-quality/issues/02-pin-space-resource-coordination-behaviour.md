# 02: Pin Space Resource coordination behaviour

**What to build:** A characterisation of the session registry's coordinated Space Resource lifecycle, complete enough that 03 and 04 can move the code freely and any change in behaviour fails a test. Cover create, update and delete; recovery through retry and keep-local; unwinding after a participant or commit throws; provisional creates being dropped; and the persistence barrier.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Each path above has a test through the registry's public interface, reusing the existing tests where they already cover it
- [ ] Only the gaps get new tests, and each new test states which path it pins
- [ ] No production code changes
- [ ] `pnpm verify` green
