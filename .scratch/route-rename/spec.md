# Rename path to Route

Source: split out of the retire-Node change, 2026-07-19.

## Problem

`CONTEXT.md` names the concept **Route** and lists "path" under _Avoid_. The code says `path`/`paths` throughout. AGENTS.md currently carries this divergence as a documented gotcha:

> **"path" == Route.** The code and this file say `path`/`paths` (`buildPathEdges`, `pathCardIds`); CONTEXT.md's domain term is **Route** and lists "path" under _Avoid_. Same concept — the glossary is the naming target; the code hasn't been renamed yet.

## Why it was split

Retiring Node was a *structural* collapse (a whole entity disappeared); this is a *pure* rename (same structure, better word). Landing both in one diff would have made the diff unreadable and the test surface ambiguous — when something broke, you could not tell which rename did it. Deliberately deferred so each stays legible.

## Scope

No structural or behavioural change. Symbols only, plus the authored key in the manifest.

## Issues

- `01-rename-path-to-route`
