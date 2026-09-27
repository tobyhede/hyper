# 05 — An author replaces the image

**What to build:** Replacing an Image Resource's picture follows the pattern of editing a Markdown Resource: a **Replace** command in the Resource's toolbar, where the Markdown Resource draws Edit, swaps the content in place (ADR 0064's opening/editing split, applied to the image kind). Replace on a Closed Image Resource opens it first. While replacing, the picture is swapped for an upload target that fills the content area: the `@project/ui` `Empty` component in its outline treatment (shadcn's `empty-outline` example — dashed border, image icon, a short title) with an **Upload** button at its centre that opens the file picker, a drop target over the whole area that accepts one image file, and a URL field beneath the button (shadcn's `empty-input-group` example). Cancel replaces Replace in the toolbar while the target is shown, Close stays visible but disabled, and Escape cancels, as for the Markdown editor. Choosing or dropping a file stores it and takes the stored image's URL; submitting the field takes that URL. Either loads the image and completes one Edit changing the URL and the recorded natural size (absent if the image does not load) and nothing else — identity, Title, placement, Edges and a remembered Open Size are kept (ADR 0106) — and the content returns to the picture. Replacing with the current URL is `unchanged`. A refused URL or stored-image refusal is shown in the target and changes nothing; the target stays up. The failed-image state (ticket 03) offers the same Replace. shadcn has no dropzone component, so the drag-and-drop handling on the `Empty` is hand-rolled and recorded as a deviation before it is written (`$shadcn-first-ui`, ADR 0047). Starts with `$shadcn-first-ui`.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] The toolbar of a selected Image Resource offers Replace where a Markdown Resource offers Edit; on a Closed one, Replace opens it and shows the upload target.
- [ ] While replacing, the content area is the upload target with Upload centred, Cancel replaces Replace, Close is disabled, and Escape or Cancel restores the picture with no Edit.
- [ ] Choosing a file with Upload stores it and replaces the URL with the stored image's in one Edit; Undo restores the old URL.
- [ ] Dropping an image file on the target does the same; dropping a non-image file is refused in the target with the application's words and changes nothing.
- [ ] Entering a new `https:` URL replaces the image in one Edit.
- [ ] A `data:` URL is refused in the target with the application's words for the code.
- [ ] The same URL produces no Edit.
- [ ] The failed-image state's Replace shows the same target.
- [ ] Ladle story and application proof (ADR 0052).
