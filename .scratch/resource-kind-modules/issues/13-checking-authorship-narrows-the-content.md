# 13 — Checking authorship narrows the content

Status: resolved

**Why:** whether an author may change content here is answered by a plain boolean, so the type checker forgets the answer and each view half that begins an edit rebuilds the content as the Resource's own by hand. The answer and the type that depends on it should be one thing.

**What to build:** asking whether content is the Resource's own narrows it, and asking whether an author may change it builds on that, so a view half that has asked can begin its edit with the content it was given. The type of a Resource's own content lives in the core beside the question, and the view halves stop restating provenance. Editing a Markdown or Image Resource behaves exactly as before.

**Blocked by:** 12 — The registry says where content came from.

- [x] Whether content is the Resource's own is a type guard, sound on both branches; whether an author may change it stays a boolean, so no branch narrows own content away.
- [x] No view half rebuilds content to mark it as its own.
- [x] The existing editing and Replace tests pass unchanged in behaviour.

## Answer

Built (2026-10-14). `isOwnContent(content)` is a type guard, `content is OwnResourceContent`, where `OwnResourceContent` is `ResourceContent & { readonly via: 'self' }` in `packages/core/src/resource-content.ts`; it is sound on both branches, since it answers exactly whether `via` is `'self'`. `authorsContent` stays a boolean built on it, because own content of a kind no author changes answers no and a two-sided guard would narrow such content to `never` (the review of #377). The Markdown and Image view halves ask both before beginning an edit, and pass the content through. `packages/core/test/resource-content.property.test.ts` holds the guard and `authorsContent`'s boolean type. The UI's `OwnContent<K>` is `OwnResourceContent` narrowed to one kind.
