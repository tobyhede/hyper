# 01: Record Canvas commands in ADR 0138 and the glossary

**What to build:** The design in `../spec.md` is written down where the next agent reads first. Proposed ADR 0138 gains the Canvas command: its three aims (focused Resource, selection, canvas, and Delete's inside-canvas flag), the Maps it serves (own Map or any), the three availability answers (available, unavailable with a reason, absent), and the one run path through command outcomes. It also records that the rail and the `?` sheet are adapters over the same commands as the dispatcher. `CONTEXT.md` gains "Canvas command", kept distinct from the Command Dock and command outcomes. Configurable-shortcuts ticket 01 is rewritten to say it is built by this effort's tickets 02 to 07, keeping its done-when, so the work is not done twice.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] ADR 0138 stays `proposed` and is still absent from `docs/adr/README.md`, which `adr-status-blocks.test.ts` requires.
- [ ] ADR 0138 states the aims, served Maps, availability answers and run path, and says that keys stay silent when unavailable.
- [ ] `CONTEXT.md` defines Canvas command, and `current-domain-vocabulary.test.ts` passes.
- [ ] Configurable-shortcuts ticket 01 points at `.scratch/canvas-commands/` and no longer prescribes "apply `keyBelongsElsewhere` once" for every key.
