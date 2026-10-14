# 13 — Checking authorship narrows the content

Status: ready-for-agent

**Why:** whether an author may change content here is answered by a plain boolean, so the type checker forgets the answer and each view half that begins an edit rebuilds the content as the Resource's own by hand. The answer and the type that depends on it should be one thing.

**What to build:** asking whether an author may change content narrows it to content that is the Resource's own, so a view half that has asked can begin its edit with the content it was given. The type of a Resource's own content lives in the core beside the question, and the view halves stop restating provenance. Editing a Markdown or Image Resource behaves exactly as before.

**Blocked by:** 12 — The registry says where content came from.

- [ ] The authorship question is a type guard whose true branch is the Resource's own content; its false branch narrows nothing away.
- [ ] No view half rebuilds content to mark it as its own.
- [ ] The existing editing and Replace tests pass unchanged in behaviour.
