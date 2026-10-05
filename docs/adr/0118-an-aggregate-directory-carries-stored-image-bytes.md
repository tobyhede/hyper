# An Aggregate directory carries stored image bytes

Status: accepted
Refines: 0106
Related: 0054, 0056, 0078, 0117

ADR 0106 kept a stored image outside the aggregate and had Export carry only an Image Resource's URL. So Export, a reset and Import restored a Space and not its uploaded pictures, and an Aggregate directory committed to git lost every picture an author had uploaded. Running (ADR 0117) makes the directory the only durable copy, so that loss would be a loss of authored work. The tracked fixture already needed a workaround for it: a separate directory of image files that the fixture importer stored first.

**An Aggregate directory now carries the bytes of every stored image the aggregate references, in `images/`, and Exporting writes them and Importing admits them, on every store.** There is one directory format, whichever store wrote it.

## What it is

- **Naming.** Each image is written as `images/<content-id>.<ext>`. The content id is the stored image's id (ADR 0106): the SHA-256 of its bytes as unpadded base64url, which is also the last segment of its `/images/<id>` URL. The extension follows the format the bytes are: `png`, `jpg`, `webp` or `gif`. The same picture always has the same name, so it is written once however many Resources show it and does not churn in git.
- **Export writes the referenced images.** Export reads the stored images that the aggregate's Image Resources name and writes their bytes through the same staged write as the Spaces: copy, rewrite, re-read and verify through Import's reader, then swap by rename. A failure writing an image leaves the destination as it was.
- **Export rewrites `images/` whole.** What Exporting removes is exactly what Importing scans: the visible regular files in `images/`. So a picture no Resource references any more leaves the directory, and an `images/` left empty is removed. A dotfile, a subdirectory or a link inside `images/` is the author's and is carried across, like any other file the format does not read. A destination whose `images/`, or one of the image files Export is about to write, is a symbolic link is refused, as Space files already are.
- **Some URLs carry no bytes.** An external URL is exported as its URL, because its bytes are not the repository's (ADR 0106). A stored URL whose bytes the store does not hold is exported as its URL too, and the Export still completes: one missing picture does not stop the rest of the aggregate reaching disk.
- **Import admits the images before the aggregate is stored.** Every image in `images/` is admitted by the rule that stores an uploaded picture: format from the bytes, the 10 MiB cap. Each is stored before either lifecycle door runs (ADR 0078), so every picture the aggregate shows is there to load as soon as the aggregate is. A file that is not an image the host stores, or that is not named for its own content, refuses the directory before anything is stored. A misnamed file would be stored under a URL no Resource shows.
- **Import does not refuse a stored-image URL whose bytes are absent.** Such a Resource draws as an image that will not load, which ADR 0106 already allows, so a directory exported while bytes were missing still imports. The fixture importer stays stricter: a tracked fixture that names a stored image its own `images/` does not carry is refused, so the fixture and its files cannot drift apart (ADR 0054).
- **Images stay outside the aggregate's revision.** Writing them is part of Exporting, not of a commit, and no revision records them. An image is immutable because its id is its content, so it cannot change between the aggregate read and the image read. Storing an image is still not a lifecycle door: an Import whose aggregate is then refused leaves the images it stored. Each is a picture nothing references, like an upload whose Edit never landed, and ADR 0106 already says a stored image is never deleted.

## Considered options

- **Keep URLs only (ADR 0106 as written).** Rejected. It loses every uploaded picture on a round trip, and Running makes that round trip the only persistence.
- **Put the bytes inside each Space directory.** Rejected. A stored image is shared across the repository and identified by content, not owned by a Space. Two Spaces showing one picture would write it twice, and moving a Resource would move its file.
- **Write every stored image, referenced or not.** Rejected. The store never deletes (ADR 0106), so the directory would keep every picture ever uploaded and replaced. A picture no Resource shows would survive in git with nothing to say why it is there.
- **Refuse an Import whose stored-image URLs have no bytes.** Rejected for public Import. It would make a directory exported with a missing picture unimportable, and an image that will not load is already an allowed state. It is kept for the tracked fixture, where it guards tracked files.

## Consequences

ADR 0106's exception to ADR 0056 narrows. An external image URL's bytes are still not the repository's. A stored image the aggregate references now travels with it, so Export, a reset and Import restores the pictures as well as the Spaces. A stored image nothing references still does not travel.

The fixture's separate image directory is gone: the tracked picture lives in the fixture's own `images/`, and the fixture importer imports through the normal path.
