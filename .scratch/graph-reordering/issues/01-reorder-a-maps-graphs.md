# 01 — Reorder a Map's Graphs

Status: needs-triage

**What to build:** an operation that lets the author change the order of the Graphs a Map owns.

The accepted design is R25 in `docs/agents/maps-and-graphs.md` (ADR 0040): Graph order is authored; creating appends, deleting keeps the survivors' order, and manual reordering is a separate operation. No such operation exists in code.

Remove the reordering entry from the contract's "Accepted, not built" section in the change that verifies this.
