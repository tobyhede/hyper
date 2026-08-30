# Name the canvas renderer, not its control

Status: superseded
Superseded by: 0068
Refines: 0053

A **canvas renderer** is a View or Layout in the role of drawing the canvas. Its
in-memory identity is `CanvasRendererId`, a tagged choice between a built-in View
id and a Layout id. The persisted identity stays flat — `BuiltInViewId | UUID` —
and `defaultRenderer(space)` translates that stored value into the tagged form.

The negative is the durable part: do not name the renderer after the control or
surface that presents it. `RendererSelection`, `CanvasChoice`, and
`SelectedCanvas` each named the same object after a different interaction or
surface, so every new presentation invited a new vocabulary for one thing.

We rejected making every name say *selection*. Selection is the established verb
for choosing Views and Layouts (ADR 0031), but the value itself is the renderer's
identity, not an act. Renaming that type fixes the names that hold it while
leaving the verb accurate. It also keeps the flat persisted representation and
the tagged in-memory representation explicit instead of forcing either across
the other boundary.
