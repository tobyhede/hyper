# 06: Take over the keys React Flow performs

Status: needs-triage

ADR 0138. Depends on 01.

Two bindings are listed in the table but performed by React Flow's own node handler, so the keymap cannot remap them:
- `nudge`: Shift+arrow moves the selected Resource four steps at a time.
- `unselectResource`: Escape on a focused, selected Resource.

**What to build, if triage wants it.** Turn off React Flow's node keyboard handling for these and perform them as commands through the dispatcher. The nudge keeps React Flow's step and commits as a move does, and both become remappable.

**Question for triage.** Whether remapping these two is worth taking over React Flow's handling and its accessibility defaults (`docs/agents/ui.md`: start from a primitive's documented keyboard behaviour). Leaving them fixed is ADR 0138's default.
