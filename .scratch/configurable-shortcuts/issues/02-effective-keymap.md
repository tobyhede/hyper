# 02: The effective keymap: defaults plus overrides

Status: ready-for-agent

ADR 0138. Depends on 01.

**What to build.** A pure `effectiveKeymap(defaults, overrides)` in `key-bindings.ts`. An override names a command id and either replaces that command's keys and press, or turns the command off. The result is what the dispatcher matches, what `aria-keyshortcuts` and the tooltips announce, and what the `?` sheet lists. `aria-keyshortcuts` is derived from the effective keys rather than written beside them.

**Collisions are on the press, not the key.** A binding holds a (key, press) pair, and `any` overlaps both `plain` and `shift`. The defaults already share keys in one context: `navigateLeft` is plain ArrowLeft and `nudge` is Shift+ArrowLeft, `openResource` is plain Enter and `openAndExpand` is Shift+Enter. Those do not collide. Plain `p` and `any` `p` would.

A separate `checkOverride(keymap, override)` refuses:
- a (key, press) another command already holds in the same context, naming that command;
- a command that is not remappable: the `Escape` bindings, and the bindings another component performs (`nudge`, `unselectResource`);
- a reserved target key: `Tab`, `Escape`, `Enter` and Space. `Tab` is the browser's, `Escape` dismisses, and `Enter` and Space are a focused control's native activation, which `keyBelongsElsewhere` leaves to it. The defaults that use `Enter` and Space keep them; an override cannot give them to another command, and Reset gives a default back.

The same (key, press) in two contexts is allowed.

**Done when.** Property tests cover these:
- with no overrides the effective keymap equals the defaults;
- an override touches only its command;
- no context ever holds two bindings whose (key, press) pairs overlap, `any` overlapping `plain` and `shift`, starting with the unmodified defaults;
- no override that `checkOverride` accepts binds a reserved key.

A unit test shows a remapped command announced and answered under its new key and no longer under its old one.
