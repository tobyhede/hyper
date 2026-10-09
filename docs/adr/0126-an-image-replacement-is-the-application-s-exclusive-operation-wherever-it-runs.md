# An image replacement is the application's exclusive operation wherever it runs

Status: accepted
Refines: 0112
Related: 0081, 0123

While any composed Space, listed or only drawn, is replacing an image, every Space withdraws its authoring and its navigation until the replacement's Edit is applied. The replacement's own target stays mounted to show its answer, and panning and zooming stay available. This is the rule the image replacement ticket gave a single Space (`.scratch/image-resource/issues/05-an-author-replaces-the-image.md`, "Other actions while a replacement runs"), applied to every composed Space.

ADR 0112 held only navigation across composed Spaces: a replacement in a Space drawn inside an Open Space Resource locked that Space and held the canvas Space's navigation, leaving the canvas Space's authoring live. That split did not hold up, for two reasons:

- **Several Edits are navigations.** New Map and New Graph continue in what they create, and deleting the selected Map or the Active Graph reselects. Each moves the canvas Space's address, which writes a history entry while Back and Forward are being held. Keeping authoring live meant knowing, per command, which Edits move the address, and nothing tied that knowledge to the surfaces offering them.
- **A surface that mixes the two kinds could not be drawn honestly.** The Dock's Map and Graph menus hold both choices and Edits behind one disclosure, so the hold either disabled the Edits the policy said were available or offered choices it would then ignore.

One tab shows one Space on its canvas, so nothing an author does there is worth running beside a replacement started in a drawn one. One answer, the open set's, now governs every Space.

**Rejected: hold navigation only, and classify each Edit by whether it moves the address.** It keeps the canvas Space authorable during a replacement elsewhere, at the cost of a per-command rule that every new Edit must remember and every surface must draw. The gaps found while building ADR 0112 were all of this kind.

**Cost accepted:** an author cannot rename, create or connect in the canvas Space while a replacement in a drawn Space is storing and measuring its image. Uploads time out after two minutes and measurement after ten seconds, so the wait is bounded.
