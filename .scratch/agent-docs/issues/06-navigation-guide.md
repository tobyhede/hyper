# 06: Move navigation and browser-history rules into their own guide

**What to build:** AGENTS.md's `app` package entry shrinks to its responsibility and its boundary. The navigation and browser-history rules move into a guide listed under "Agent skills", where an agent touching navigation finds them first. Those rules are: no router library; one module knows the browser exists; a Navigation call is never paired with a history write; how held traversals and entry numbering work.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Every rule in today's `app` entry lands in the new guide or stays in AGENTS.md as a one-line invariant. Nothing is dropped.
- [ ] Every claim about another module names the test that holds it.
- [ ] Lineage ("went when", "used to") is removed. A history sentence that guards an invariant becomes that invariant in present tense.
