# 05 — Reference is a module, and the core enforces Targets from declared references

Status: ready-for-agent

**What to build:** move the Reference kind onto the registry. Its module declares one outgoing Resource reference, its Target, and the flag that it may not itself be a Target. The core's intake replaces the hand-written Reference checks in `packages/graph` with a generic rule: every declared Resource reference resolves, and to a kind that may be a Target, which keeps referencing a single hop (ADR 0113). Content resolution (`content-resolution.ts`) asks the Target's module for its content rather than matching on kinds.

**Depends on:** 02, and 03 and 04 so every Target kind is a module.

**Acceptance:** the existing refusals for a dangling Target and a Reference-to-Reference keep their codes and wording; no code outside the Reference module names `'reference'`.
