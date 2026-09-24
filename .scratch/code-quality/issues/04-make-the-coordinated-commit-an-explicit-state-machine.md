# 04: Make the coordinated commit an explicit state machine

**What to build:** The coordinated commit's phases — aggregate read, plan, prepare, publish, install, unwind — and its recovery state, as an explicit state machine with named states and transitions, taken out of the registry's closure. The registry becomes a thin imperative shell that runs the planner (03) and drives the machine. Mutable collections shared across nested closures go away.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Each state and transition is named, and an illegal transition cannot be expressed or is refused
- [ ] Unwinding after a throw is one transition, not recovery code scattered across callers
- [ ] No function in the registry is longer than about 150 lines, and closures nest at most two levels deep
- [ ] 02's tests pass unchanged
- [ ] `pnpm verify` green
