# 13 — Checking authorship narrows the content

Status: resolved

**Why:** whether an author may change content here is answered by a plain boolean, so the type checker forgets the answer and each view half that begins an edit rebuilds the content as the Resource's own by hand. The answer and the type that depends on it should be one thing.

**What to build:** asking whether an author may change content narrows it to content that is the Resource's own, so a view half that has asked can begin its edit with the content it was given. The type of a Resource's own content lives in the core beside the question, and the view halves stop restating provenance. Editing a Markdown or Image Resource behaves exactly as before.

**Blocked by:** 12 — The registry says where content came from.

- [x] The authorship question is a type guard whose true branch is the Resource's own content; its false branch narrows nothing away.
- [x] No view half rebuilds content to mark it as its own.
- [x] The existing editing and Replace tests pass unchanged in behaviour.

## Answer

Built (2026-10-14). `authorsContent(content)` is a type guard, `content is OwnResourceContent`, where `OwnResourceContent` is `ResourceContent & { readonly via: 'self' }` in `packages/core/src/resource-content.ts`. Because every arm of `ResourceContent` carries `via: ContentVia`, no arm is assignable to the guard's type, so its false branch removes nothing: own content of a kind no author changes answers no and keeps its type. `packages/core/test/resource-content.property.test.ts` holds both branches. The UI's `OwnContent<K>` is the guard's type narrowed to one kind, and the Markdown and Image view halves begin their edit with the content they were given.
