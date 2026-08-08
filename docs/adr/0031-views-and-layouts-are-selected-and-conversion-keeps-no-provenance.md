# Views and Layouts are selected; conversion keeps no strategy provenance

Status: accepted
Refines: 0025
Refined by: 0040, 0041
Related: 0014, 0028, 0030

The renderer for a Space is chosen from two different things: an application-
supplied **Algorithmic View**, or one of the Space's authored **Positioned
Layouts**. A Space's optional `defaultView` may name either a built-in View or
one of its Layouts. When it names neither, the application fallback is always a
View; a global fallback cannot name a Layout owned by one particular Space.

The toolbar exposes that choice through an icon View selector, grouped into
Views and Layouts. Selecting either is navigation, not an edit: it changes what
the viewer sees without changing the Space or its persisted default. The
generic prototype Auto-arrange button is removed. A concrete layout strategy is
offered as a View, never hidden behind a command whose behavior depends on what
was previously selected.

Editing any Algorithmic View converts uniformly. The card positions already on
screen are copied into a new Positioned Layout, the edit is applied there, and
the selector immediately names that new Layout. It receives the next unique
neutral title (`Layout 1`, `Layout 2`, and so on). Existing Layouts are left
untouched. Automatic persistence adds the new Layout to the Space and makes it
the `defaultView`; editing an existing Layout instead updates that Layout and
makes it the default.

Conversion deliberately retains no provenance linking the new Layout to the
View or layout strategy that produced its initial positions. Editing ends the
computed rule. Returning to Graph, Grid, a future name-sorted View, or any other
Algorithmic View is a fresh selection, not a reversal of the Layout. A sorting
View therefore stops sorting when edited, exactly as ADR 0025 accepts.

We rejected recording a source strategy on the Layout. Its only value would be
choosing a later strategy without asking the author, while implying that the
Layout remains connected to a rule that conversion intentionally ended. We
also rejected special confirmation or drag behavior for sorting Views: every
Algorithmic View converts by the same rule. The costs are that selecting a View
alone is not remembered by the Space, and repeated conversions may create
several neutrally titled Layouts; both are preferable to hidden mutation or a
false promise of reversibility.
