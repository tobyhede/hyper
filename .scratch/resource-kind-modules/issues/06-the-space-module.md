# 06 — Space is a module, and the core enforces Space lifetime from declared references

Status: ready-for-agent

**What to build:** move the Space kind onto the registry. Its module declares one outgoing Space reference with the owns-lifetime flag. The core enforces, generically from declared Space references: no cycle, a Space lives while a reference holds it and is deleted with its last (ADR 0074), and every ordinary Space is reached from the Meta Space. The module's own narrow check is that its Map and Graph resolve in its target Space; it re-implements no aggregate rule.

`packages/persistence/src/space-resource-planning.ts` and the SQL repository's Space Resource comparisons (`src/persistence/sql-space-repository.ts`) read declared references rather than `kind === 'space'`.

**Depends on:** 02, 05.

**Acceptance:** the existing aggregate refusals keep their codes; no non-test source outside a module names a kind id, and a scan in `test/unit` (in the idiom of `current-domain-vocabulary.test.ts`) holds that. CSS selectors on a kind's `data-kind` or `data-content-kind` belong to that module's view half (ADR 0120) and move with it rather than being exempted. The scan exempts by name only the missing-kind default `spec.md` names.
