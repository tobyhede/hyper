# 04 — An author creates an Image Resource

**What to build:** Three gestures create an Image Resource, each completing its Edit on activation (ADR 0089, ADR 0106). The Dock's `CreatePeers` gains an image glyph that opens the file picker; choosing a file stores it (ticket 02) and creates the Resource where the Dock places new Resources, while a cancelled picker creates nothing. Dropping image files on the canvas stores each and creates one Resource per file in one Edit, in a row from the drop point. Pasting an image URL on the canvas creates one at the pointer. Each gesture loads the image before completing its Edit and records its natural size on the Resource; an image that does not load (a pasted URL that is unreachable) still creates the Resource, with no recorded size. The Title is `Resource N`, as for a Markdown Resource, never the file's name or the URL; a drop of several files numbers them in order; the caret lands in the Title. A storing refusal is reported through the application's words for its code and creates nothing. Starts with `$shadcn-first-ui`.

**Blocked by:** 01, 02

**Status:** ready-for-human

- [x] The image glyph sits among the Dock's creation peers; choosing `diagram.png` creates an Image Resource titled `Resource N` whose URL is the stored image's.
- [x] The created Resource records the image's natural size; an unreachable pasted URL creates one with none.
- [x] Cancelling the picker produces no Edit.
- [x] Dropping three images creates three Resources in one Edit (one commit), titled with three successive `Resource N` numbers. V1 has no Undo, so the single commit is what shows the drop is one Edit.
- [x] Pasting `https://example.com/a.png` creates an Image Resource with that URL titled `Resource N`.
- [x] An oversized or non-image file reports its refusal and creates nothing.
- [x] `parity-claims.ts` and the Dock's story cover the new peer (ADR 0052).
