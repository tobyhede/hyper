# 03 — Image is a module

Status: ready-for-agent

**What to build:** move the Image kind onto the registry from `02`, domain and view halves, and delete every `'image'` branch outside its module. Behaviour does not change.

**Depends on:** 02.

**Acceptance:** no code outside the Image module names `'image'`; the E2E and Ladle specs that exercise Image Resources pass unchanged.
