# 06: Take over the keys React Flow performs

Status: needs-triage

ADR 0138. Depends on 01.

Two bindings are listed in the table but performed by React Flow's own node handler, so the dispatcher does not answer them:
- `nudge`: Shift+arrow moves the selected Resource four steps at a time.
- `unselectResource`: Escape on a focused, selected Resource.

**What to build, if triage wants it.** Turn off React Flow's node keyboard handling for these and perform them as commands through the dispatcher. The nudge keeps React Flow's step, commits as a move does and becomes remappable. `unselectResource` stays on Escape, which no override may take (02, ADR 0138), so taking it over gives the dispatcher one more Escape to answer and nothing to remap.

**Question for triage.** Whether remapping the nudge, and answering Escape in one place, is worth taking over React Flow's handling and its accessibility defaults (`docs/agents/ui.md`: start from a primitive's documented keyboard behaviour). Leaving them fixed is ADR 0138's default.
