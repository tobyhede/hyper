# AGENTS.md says the app has no positioned layout, and it has had one for weeks

Status: resolved
Type: task

`AGENTS.md`'s **Decided but not built** list carries: *"ADR 0025 — a Layout is optional, and editing converts an automatic arrangement into one. The app still runs `elkStrategy()` on every boot and has no positioned layout."*

Both halves are false. `positionedStrategy` exists and is contract-tested; `resolveView` returns it whenever `defaultView` names a declared Layout; a save writes a positioned Layout *and* repoints `defaultView` at it, so the next boot resolves through it — proven end-to-end by the new-space round trip, which reloads and finds the card within 2px of where it was left. That assertion cannot pass any other way. ELK renders the fixture because the fixture declares no `layouts` and no `defaultView`, which is a resolution outcome and not a privileged engine.

The dating is the part worth recording. The bullet was written in `e10187b`, and `59802c7` — the commit that deleted the hardcoded `elkStrategy()` — is an ancestor of it. The sentence was already false the day it was typed, and two ADRs that refine 0025 (0028, 0029) have landed on top of it since, both described as built elsewhere in the same file.

The harm is the heading, not the sentence. **Decided but not built** tells a reader not to read the current code as the design — so anyone picking up 0025 work is told to ignore `resolveView`, the editor store and the save path, which *are* 0025's implementation.

Also stale, found alongside: `packages/app/vite-space-file-plugin.ts` still says "A drag therefore dirties the worktree, deliberately: ADR 0013 makes placement authored" — a drag has dirtied nothing since ADR 0029, and `AGENTS.md` already says so.

## Answer

Rewritten rather than deleted. What is genuinely unbuilt of 0025 is narrower than "all of it" and now says so: the conversion trigger is still ADR 0017's create-at-open (ticket `12`), and the structural half of 0025's definition of editing — create, delete, connect — belongs to ADR 0021 and is already listed in its own bullet. Everything else is built.

The plugin's comment now says a *save* dirties the worktree, citing 0025 for placement being authored and 0029 for the drag no longer writing.

`spec.md`'s `Status: open` was also wrong — `01`–`07` are all resolved. It now says so and points at this issue series for what is left.
