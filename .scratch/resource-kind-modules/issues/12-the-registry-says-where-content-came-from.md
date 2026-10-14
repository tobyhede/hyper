# 12 — The registry says where content came from

Status: ready-for-agent

**Why:** issue 10's last gap, "content reached through a Reference". Resolved content says whether it is the Resource's own or reached through a Target, and that word is the Reference kind's id, so the core names a kind outside `kinds/`. Worse, every kind module is handed that provenance and copies it into its result unread, although only the registry knows whether it followed a Target.

**Decided (Toby, 2026-10-14, after a three-way design comparison in the project thread):** provenance is the registry's alone, spelled `'self' | 'target'`. A boolean `own` and a general "reach" declaration (several Targets, read or author grant, composition) were rejected: the first reads worse beside ADR 0070's wording, the second has one adapter and contradicts ADR 0070's immutable Target. A kind's content Target stays a single Target until a second reaching kind arrives with an ADR.

**What to build:** a Resource's resolved content says `'self'` when it is its own and `'target'` when a kind's content Target named the Resource shown, and only the registry's content resolution sets it. A kind module resolves its content without being told how it was reached, and its resolved content does not carry provenance. Content that cannot be reached is unresolved, says `'target'`, and names no kind. The embedded Map still asks whether its content was shown through a Target, not whether an author may change it.

**Blocked by:** None (can start immediately).

- [ ] No kind module's content resolution takes or returns provenance; the registry stamps it in every path.
- [ ] The core outside `kinds/` names no kind for provenance or unresolved content, so that file leaves the import ban's exemptions and its row in `../kind-sites.md` goes, and the counts shrink by it.
- [ ] A test kind that declares a content Target resolves its Target's content as `'target'` with no edit to the core.
- [ ] A Reference Resource still shows its Target's content read-only, and the embedded Map through a Reference is still read-only, held by the existing tests.
- [ ] Stories and tests say `'target'` where they said the Reference kind's id.
