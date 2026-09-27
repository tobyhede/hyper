# An Image Resource owns a URL, not bytes

Status: accepted
Refines: 0056
Refined by: 0107
Related: 0051, 0054, 0070, 0101

An **Image Resource** is a fourth Resource kind, `image`. Its content is an **image URL**. The Resource does not own the picture's bytes, and nothing about the Resource says where they are stored. The host also stores **images** of its own, each at a URL named for what it is, and an author who has a picture but no URL for it sends it there to get one. A stored image is not a variety of Image Resource, and the Resource carries no flag recording where its URL points.

This refines ADR 0056, "the repository is the only source of state", with one exception, and the exception is two things. **An external URL's bytes are not the repository's**: they are fetched from somewhere else, can change or disappear, and a Space showing them is not fully derived from tracked state. **A stored image is not part of the aggregate**: it is authored database state like any Edit, and a reset clears it like any Edit, but Export does not carry it, so Export, reset and Import restores the Space and not its stored pictures. Everything else ADR 0056 says still holds — the store is minted by migrations, fixtures reach it only through tracked files (below), and no compatibility path is kept for an image a previous build wrote. We accept the exception because the alternative costs more than it saves.

## Considered options

- **The Resource owns its bytes, inline in its document.** Rejected. Every Space load would carry every image, and one image over about 750 KB could not pass the 1 MiB commit cap.
- **The Resource owns its bytes, in a content-addressed store inside the aggregate.** This keeps the repo-state rule, at the cost of putting binary lifecycle into the aggregate, Export and Import. It was the first answer and was reversed. Storage decoupled from the Resource lets the image kind land without a binary aggregate, and an image the author already has at a URL needs no copy.

## What it is

- **Accepted URLs.** `https:` and `http:` URLs, and the root-relative URL of a stored image, which survives the host changing port or name. `data:` is refused, because it would put the bytes back in the document. Every other scheme is refused.
- **Stored images.** The host keeps images beside Spaces and outside the aggregate, shared across the repository, at `/images/<id>`. The collection is named for its content and is not a product destination; a later content kind gets its own collection (`/files/<id>`) rather than an umbrella that reuses the word Resource. An image's id is the SHA-256 of its bytes, spelled as unpadded base64url — a deliberate exception to minted UUIDs, because an image is identified by its content: the same picture always has the same URL and is stored once. The host names the store after the thing stored, never after the action that stored it. Storing accepts PNG, JPEG, WebP and GIF, identified from the bytes rather than from the declared type, up to 10 MiB. Its refusals carry named codes that the application puts into words. SVG is left for its own decision. An external URL shows whatever the browser can draw.
- **Replacing the image is an Edit.** It changes the URL and the recorded natural size and keeps the Resource's identity, Title, placement and Edges. The Image Resource's entity menu offers Replace image, a popover with a URL field and a button that chooses a file and stores it, either of which completes one Edit. The failed-image state offers the same Replace.
- **No single stored image is ever deleted.** A URL can be copied into any Space, exported, or pasted anywhere, so nothing can know an image is unused. Only a database reset clears the store, whole, with everything else. PostgreSQL, SQLite and the memory runtimes each have the store.
- **Fixtures store tracked files.** Tracked image files sit beside the fixtures and seeding stores them through the same door, their URLs known in advance from their content, so a fixture's Image Resources load without the network.
- **The Title is the text alternative.** There is no separate alt-text field (ADR 0051 gives a kind its fields, and this kind needs none beyond its URL and its optional recorded natural size).
- **Closed, it looks like any Resource.** It draws its Title and kind treatment and no thumbnail.
- **Open, the Resource is the image plus its border.** The Title is part of the border, as on an Open Space Resource, not a band above the content. The image fills the area inside the border, contained within it. Resize stays free, as for every kind. The border's exact form is settled by a prototype against the Open Space Resource.
- **The image is measured when its URL is set, not when it Opens.** Creation and Replace, which are already asynchronous because they store a file or take a URL, load the image and record its natural size on the Resource, an optional field. Opening stays one synchronous Edit: the first Open reads that size and writes an Open Size whose inner area is the natural size at one pixel per canvas unit, scaled down proportionally to fit within 1280×960, plus the border, and never smaller than the Closed size on either axis. An image that did not load when its URL was set records no size, and the Resource opens at the default Open Size. A recorded size can go stale only when an external URL starts serving a different picture; a stored image never changes, because its id is its content. Replacing the image re-measures it but does not change a remembered Open Size — only a first Open reads the natural size.
- **An image that will not load is not a refusal.** The Space is still valid. The Open Resource shows its Title, a failed-image state naming the URL, and Replace.
- **A Reference Resource may target an Image Resource** and shows its image read-only (ADR 0070).
- **Creation completes on activation (ADR 0089).** Three gestures create one: an image glyph among the Dock's creation peers, which opens the file picker and creates nothing if cancelled; dropping image files on the canvas, which creates one Resource per file in one Edit, in a row from the drop point; and pasting an image URL on the canvas. The Title is `Resource N`, as for a Markdown Resource — never the file's name or the URL — and the caret lands in the Title.

## Consequences

Export and Import carry the URL and nothing else. An imported Space can hold an Image Resource whose picture is missing, and that is the failed-image state rather than an intake error.
