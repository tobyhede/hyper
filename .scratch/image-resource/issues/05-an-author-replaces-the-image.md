# 05 — An author replaces the image

**What to build:** Replacing an Image Resource's picture follows the pattern of editing a Markdown Resource: a **Replace** command in the Resource's toolbar, where the Markdown Resource draws Edit, swaps the content in place (ADR 0064's opening/editing split, applied to the image kind). Replace on a Closed Image Resource opens it first. While replacing, the picture is swapped for an upload target that fills the content area: the `@project/ui` `Empty` component in its outline treatment (shadcn's `empty-outline` example — dashed border, image icon, a short title) with an **Upload** button at its centre that opens the file picker, a drop target over the whole area that accepts one image file and refuses a drop containing several files before storing any of them, and a URL field beneath the button (shadcn's `empty-input-group` example). Cancel replaces Replace in the toolbar while the target is shown, Close stays visible but disabled, and Escape cancels, as for the Markdown editor. While storing or measuring a replacement is in flight, Upload, the URL field and dropping are unavailable, Cancel is unavailable and Escape does not dismiss the target; once that attempt answers, a refusal stays visible in the target and cancellation is available again. Choosing or dropping a file stores it and takes the stored image's URL; submitting the field takes that URL. Either loads the image and completes one Edit changing the URL and the recorded natural size (absent if the image does not load) and nothing else — identity, Title, placement, Edges and a remembered Open Size are kept (ADR 0106) — and the content returns to the picture. Replacing with the current URL is `unchanged`. A refused URL or stored-image refusal is shown in the target and changes nothing; the target stays up. The failed-image state (ticket 03) offers the same Replace. shadcn has no dropzone component, so the drag-and-drop handling on the `Empty` is hand-rolled and recorded as a deviation before it is written (`$shadcn-first-ui`, ADR 0047). Starts with `$shadcn-first-ui`.

**Blocked by:** 01, 02, 03

**Status:** resolved

- [x] The toolbar of a selected Image Resource offers Replace where a Markdown Resource offers Edit; on a Closed one, Replace opens it and shows the upload target.
- [x] While replacing, the content area is the upload target with Upload centred, Cancel replaces Replace, and Close is disabled. Escape or Cancel restores the picture with no Edit while no attempt is in flight; both are unavailable while storing or measuring a replacement.
- [x] Choosing a file with Upload stores it and replaces the URL with the stored image's in one Edit (one commit, over the revision holding the old URL). V1 has no Undo, so the single commit is what shows it is one Edit.
- [x] Dropping an image file on the target does the same; dropping a non-image file is refused in the target with the application's words and changes nothing. A drop containing several files asks for one image and stores nothing, measures nothing and makes no Edit.
- [x] Entering a new `https:` URL replaces the image in one Edit.
- [x] A `data:` URL is refused in the target with the application's words for the code.
- [x] The same URL produces no Edit.
- [x] The failed-image state's Replace shows the same target.
- [x] Ladle story and application proof (ADR 0052).

## Remembered size when replacing

Replace preserves the Open Size this Resource remembers in each Map (ADR 0106).
On a Closed Resource it first Opens using the old image's recorded natural size,
or the default Open Size when that image had no recorded size. Replacing the
image then keeps that size, including when a working image replaces one that
failed to load. Closing and reopening also restores the remembered size.

This is the accepted cost of preserving the author's Map geometry: Replace does
not automatically fit the new picture or offer a re-fit command. The author can
resize the Open Resource manually. A first Open in another Map that has no
remembered Open Size uses the replacement's recorded natural size.

## Other actions while a replacement runs

Submitting a replacement makes it the application's exclusive operation until
storing, measuring and applying the Edit have finished. Navigation and authoring
are unavailable during that time, including switching Maps or Spaces, changing
the Active Graph, starting another replacement and persistence recovery actions
that replace the current session. The current replacement target stays visible.
Panning and zooming remain available. Cancel and Escape remain unavailable until
the attempt answers.

Back and Forward within the application retain the current context while the
operation runs and preserve the history entries for later navigation. Reloading,
closing the tab or leaving the document uses the browser's leave confirmation;
the application cannot forbid the author from accepting that confirmation.

Success, refusal and unexpected failure all release the lock. A refusal or
unexpected failure leaves the old image unchanged and displays the error in the
target. Uploads time out after two minutes; image measurement stops waiting after
ten seconds and supplies no natural size when the image cannot be measured. The
lock ends after applying the Edit, without waiting for persistence acknowledgement
or retry.
