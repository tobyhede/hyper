# Presentation Notes are a Graph found by its title

Status: accepted
Refines: 0123
Related: 0024, 0040, 0081, 0109, 0111

A presentation's notes are ordinary Resources, connected to the Resources they annotate by an ordinary Graph on the same Map. That Graph, the **Presentation Notes Graph**, is found by its title, not by anything stored: a Graph whose title reads as the talk Graph's title followed by a marker, or as a marker alone. The markers are "Presentation Notes", "Notes", and "Presentation" followed by at least one more word. Titles are compared as words, after NFKC normalisation and case folding, with every run of characters that are neither letters nor digits, Title Line breaks included, counted as one separator.

When several Graphs match, a title naming the talk beats a bare marker; then "Presentation Notes" beats "Notes", which beats "Presentation" and more; then the Map's Graph order. A Graph is never its own notes. A note is any Resource the Active Resource reaches by an Edge of the Presentation Notes Graph, and several notes are ordered by where they sit on the Map, top edge then left edge.

Notes are read in a **Notes window**: a second window with its own product URL that follows whichever window is presenting the Space. The presenting window keeps sole ownership of Navigation. The Notes window renders what the presenting window publishes and sends it the same traversal commands a key press on the Stage would.

## Why a convention

The Space's model stays as it is. Notes need no field on the Resource, no new kind, no link from one Graph to another and no change to the Space or Resource file formats. Every capability notes need already exists: Resources of any kind to hold them, Edges to attach them, a Map to arrange them on, and editors to write them. An author who never makes a notes Graph presents exactly as before.

## Rejected

- **A `notes` field on the Resource.** It would change the envelope, the schemas, the stored documents and the files of every kind. It would also give a Resource one set of notes however many talks use it.
- **Notes inside the Markdown body**, as Slidev and reveal.js do it. That works for one kind, and every renderer that draws Markdown, Open on the canvas as well as the Stage, would have to strip the notes or show them to the audience.
- **An explicit link from a talk Graph to its notes Graph.** It's the model change the convention avoids. A future UI that picks the notes Graph may add one, with the convention as its default.
- **One notes Graph per Map**, or only a bare "Notes" Graph. Two talks on one Map would then share notes.

## Cost accepted

- **Renaming a talk Graph orphans a notes Graph that names it** until that is renamed too. The Notes window says when a talk has no notes Graph, which is what makes this visible.
- **A Graph titled "Presentation Outline" is taken as notes.** The Notes window names the Graph it chose and those it passed over, so a wrong pick is visible and fixed by a rename.

## Negative

- The Notes window offers no authoring, and nothing about notes reaches the Stage. ADR 0123's negatives stand.
- Do not store which Graph holds the notes as a side effect of finding it. The title is the record until a UI selection is decided.
