# 06 — Batch import and dangerous truncation

**What to build:** Extend import to a directory containing multiple immediate child spaces and provide an explicit all-or-nothing database reset mode through `--dangerous-truncate`.

**Blocked by:** 05 — Single-space CLI import.

**Status:** ready-for-agent

- [ ] A directory without its own `space.json` imports each immediate child directory that contains one, without deeper recursion.
- [ ] The entire batch is discovered, parsed, identity-checked, and validated as one operation.
- [ ] Ordinary batch import upserts explicit identities, inserts id-less entities, and never deletes database content by absence.
- [ ] `--dangerous-truncate` is rejected when no import path is supplied.
- [ ] Dangerous truncation deletes every Hyper card and space before importing, inside the same transaction as the complete batch.
- [ ] Any error rolls back both truncation and every import in the batch.
- [ ] CLI output clearly distinguishes discovery, parsing, identity, domain-validation, database, and revision-conflict failures.
- [ ] Integration tests prove preservation without the flag, total replacement with the flag, and complete rollback on failures after truncation begins.
