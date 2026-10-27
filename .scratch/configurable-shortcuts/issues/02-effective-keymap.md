# 02: The effective keymap: defaults plus overrides

Status: ready-for-agent

ADR 0138. Depends on 01.

**What to build.** A pure `effectiveKeymap(defaults, overrides)` in `key-bindings.ts`. An override names a command id and either replaces that command's keys and press, or turns the command off. The result is what the dispatcher matches, what `aria-keyshortcuts` and the tooltips announce, and what the `?` sheet lists. `aria-keyshortcuts` is derived from the effective keys rather than written beside them.

A separate `checkOverride(keymap, override)` refuses:
- a key another command already holds in the same context, naming that command;
- a command that is not remappable: `Escape`, `Tab`, and the bindings another component performs (`nudge`, `unselectResource`).

The same key in two contexts is allowed.

**Done when.** Property tests cover these:
- with no overrides the effective keymap equals the defaults;
- an override touches only its command;
- no context ever holds one key twice.

A unit test shows a remapped command announced and answered under its new key and no longer under its old one.
