# 03: Overrides kept in this browser

Status: ready-for-agent

ADR 0138. Depends on 02.

**What to build.** Overrides are one `localStorage` entry, read once at startup and written on each change. Parse it strictly at that boundary with a Zod schema (`docs/agents/anti-slop.md`, "parsing boundaries"). Drop an unknown command id or a malformed entry, and keep the default for it. Then check the remaining overrides together, on the keymap they produce, not one at a time against the defaults: a swap of `C` and `P` is valid as a set, though each half collides with the other's default. While the produced keymap has a collision, a reserved key or a non-remappable command, drop every override involved in one and check again. Each round drops all of them, so the result does not depend on the order of the stored entries, and it ends because the defaults are valid. Storage that throws, is empty or is unavailable leaves the defaults and never stops startup. `localStorage` is per origin, so every Space opened from one origin shares the entry, and each origin keeps its own: the dev hosts (5173–5177), `pnpm hyper run` (4173 or the next free port) and each host serving a mounted page (ADR 0130). Nothing outside the browser reads or writes it, and an aggregate never carries it. Reset to defaults clears the entry.

**Done when.** Tests cover storage that throws on read and on write, a stored command id that no longer exists, a stored key that now collides with a default, a stored swap of two commands' keys, which survives a reload, and two stored overrides claiming one key, which are both dropped whichever is stored first. Each of them starts with the defaults standing for the entries it could not use.
