# 07 — Map creation through both context adapters

Status: ready-for-agent
Blocked by: 06

**What to build:** Move top-level and embedded Map creation behind `MapAuthoringCommands.create`. The asynchronous capability owns creation coordination, live availability rechecking, recovery of the created Map and Active Graph identities, and the embedded context's persistence ordering and durable Space Resource selection. A successful outcome carries those identities; each surface uses them for its own rename continuation.

**Why:** Creation is one Map Edit with two context-specific sequences. Keeping those sequences behind private adapters gives both callers one interface while preserving the rule that caret and focus treatment belong to the surface.

- [ ] Top-level creation creates and selects the empty Map and returns its Map and Active Graph identities through the shared interface.
- [ ] Embedded creation waits for the required Spaces, durably updates the Space Resource's Map and Graph selection, and returns the same completed outcome shape.
- [ ] General availability and current Space state are rechecked at invocation; unavailable is distinct from unchanged and refused.
- [ ] Refusals and coordination failures return complete structured Map reports whose lifetime remains with command outcomes.
- [ ] The Command Dock and embedded rail request their correctly scoped rename continuations only after a completed outcome; the module imports no continuation, React or DOM treatment.
- [ ] The contract suite proves both adapters, and application and Ladle behavior continue to prove the visible command, unavailable treatment and caret continuation.

