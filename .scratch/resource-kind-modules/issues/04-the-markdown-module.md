# 04 — Markdown is a module

Status: ready-for-agent

**What to build:** move the Markdown kind onto the registry from `02`, domain and view halves, and delete every `'markdown'` branch outside its module. Behaviour does not change.

**Depends on:** 02.

**Acceptance:** no non-test source outside the Markdown module names `'markdown'`, and CSS selectors on `data-kind='markdown'` or `data-content-kind='markdown'` move with the module's view half (ADR 0120); the E2E and Ladle specs that exercise Markdown Resources pass unchanged.
