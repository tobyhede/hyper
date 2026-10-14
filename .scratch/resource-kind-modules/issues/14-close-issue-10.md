# 14 — Close issue 10

Status: resolved

**Why:** once 12 lands, every gap issue 10 records is routed or deliberately kept, but the ticket, the site table, AGENTS.md and the spec still say the work is open.

**What to build:** issue 10 is resolved with an Answer: candidates B, C, D and F and content provenance routed, G and H dropped, and each site still counted on purpose listed with its reason. `../kind-sites.md` matches main line for line, stale rows such as the Space Resource targets one gone. The ADR 0128 entry in AGENTS.md and the spec's "Not met" note describe what remains counted rather than pointing at an open ticket.

**Blocked by:** 12 — The registry says where content came from; 13 — Checking authorship narrows the content.

- [x] Issue 10 is `Status: resolved` with an Answer that satisfies its own acceptance.
- [x] Every row of `../kind-sites.md` names a line on main that still names a kind, and the kind-ids scan and import ban agree with it.
- [x] AGENTS.md and `../spec.md` no longer call issue 10 open.

## Answer

Built (2026-10-14). Issue 10 is resolved with an Answer listing what was routed and what stays, each with its reason. `../kind-sites.md` was checked row by row: the Space Resource targets row (no longer naming `spaceKind`) is gone and seven drifted line numbers are corrected. The ADR 0128 entry in AGENTS.md now reads "built", points at `kind-sites.md` for the sites kept, and no longer cites issue 10 as open; the spec's "Not met" note says the same.
