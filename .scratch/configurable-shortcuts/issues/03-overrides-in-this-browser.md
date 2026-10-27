# 03: Overrides kept in this browser

Status: ready-for-agent

ADR 0138. Depends on 02.

**What to build.** Overrides are one `localStorage` entry, read once at startup and written on each change. Parse it strictly at that boundary with a Zod schema (`docs/agents/anti-slop.md`, "parsing boundaries"). Drop an unknown command id, a malformed entry, or one `checkOverride` refuses, and keep the default for it. Storage that throws, is empty or is unavailable leaves the defaults and never stops startup. Every Space and every mount in the browser shares the one entry. Nothing outside the browser reads or writes it, and an aggregate never carries it. Reset to defaults clears the entry.

**Done when.** Tests cover storage that throws on read and on write, a stored command id that no longer exists, and a stored key that now collides with a default. Each of them starts with the defaults standing for the entries it could not use.
