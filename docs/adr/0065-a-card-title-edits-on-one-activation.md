# A Card Title edits on one activation

Status: accepted
Refines: 0036
Related: 0037, 0048, 0051

A Card's displayed Title is an editing control whenever Title authoring is
available. One activation — a pointer click, `Enter`, or `Space` — replaces it
in place with the Title field, focuses that field and selects its complete
value. The control retains the Title's heading relationship and has an
accessible name that identifies both the edit action and the Card.

This rule belongs to the shared Title, not to a Card kind. `F2` remains the
shortcut for renaming the Selected card without travelling to its Title.

The rest of the Card keeps its own gestures. Activating the Title edits it;
clicking elsewhere on the Card selects it; and the rail's Edit control Opens
the Card. None is a prerequisite for another. Title editing therefore does not
select or Open the Card as a side effect.

Completion is unchanged from ADR 0048. `Enter` or a valid blur completes the
Title, `Escape` restores the authored value, and a refusal remains beside the
focused field. A keyboard completion or cancellation returns focus to the
Card; a pointer blur leaves focus where the author put it.

## Why one activation

ADR 0036 gave the Title a double click because the Card then centred its Title
across the pixels opening and renaming both wanted. ADR 0051 subsequently gave
the Title its own bounded region, so that old premise no longer holds. The
double click remained an invisible convention: the Title exposed no
interactive role, touch offered no equivalent, and a keyboard author had to
discover the separate sequence of selecting a Card and pressing `F2`.

Making the displayed Title a real control gives pointer, keyboard and assistive
technology users one operation with one focus transition. It also follows the
direct-manipulation promise of inline editing: the value an author wants to
change is the control that changes it.

An additional pencil control was rejected. The rail already carries an Edit
control whose meaning is Opening the Card; a second identical symbol would put
two edit actions with different scope beside the same Title. The Title itself
is the unambiguous target for renaming it.

## What it costs

A click on the Title no longer performs the Card body's selection gesture. The
target is limited to the pixels the Title draws, so the rest of the Card remains
the large selection target. Authors who want to select from the keyboard retain
the Card's existing focus and selection behavior.

The control must look like the Title rather than like a form button, while still
showing a visible hover and focus affordance. That visual restraint makes the
single-click convention carry some discoverability; the semantic control,
keyboard operation and focus treatment carry the rest.

## The negative to remember

Do not restore double-click Title editing as an extra path. Two pointer
conventions for the same transition make the first click of one convention the
complete other convention, and leave touch with the weaker one.

Do not route Title activation through Card selection or Opening. Selection names
the subject of a later Card-level command, Opening expands the Card, and Title
activation already names the exact field and operation.

This decision changes only the Title. Markdown-source editing remains separate
because source has its own editor and keyboard contract.
