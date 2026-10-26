# Keyboard shortcuts

Status: ready-for-agent

## Problem Statement

The canvas's keys can't be discovered and don't hang together. `C` adds a Resource, `Enter` or `Space` Opens the focused one, `F2` renames and `Delete`/`Backspace` removes, but nothing on screen names any of them. Each is a hand-rolled handler with its own copy of the modifier, repeat and text-control guards, and their scopes differ: `C` answers only while the React Flow wrapper has focus, so it stops after a click on the Dock, while `F2` listens on the window. Tab moves through Resources in the order they are drawn, not along a Graph. Arrow keys nudge a Resource's position, which nobody wants as the plain arrow. There is no key to present from a Resource, to read one at a size that suits it, or to see a Resource full-window. While presenting, the keys a clicker sends, `PageDown` and `PageUp`, do nothing.

## Solution

Every shortcut is declared in one binding table. The handlers, `aria-keyshortcuts`, the Dock's tooltips, a `?` sheet and the tests all read that table. Canvas keys answer wherever focus is, except in a text control, a menu or a dialog.

From a selected Resource:

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Go along the **Active Graph** forward (first outgoing Edge) or back (incoming Edge). With no next Resource along the Active Graph, Tab is the browser's and leaves the canvas. |
| Arrow keys | Move to the Active Graph neighbour, by an Edge in either direction, that lies in that direction; the one nearest the pressed axis wins. Nothing that way does nothing. At a fork the arrow picks the branch. |
| `Shift`+arrow | Nudge the Resource's position (React Flow's plain-arrow behaviour, moved). |
| `Enter` | Open, unchanged. |
| `Shift+Enter` | **Open and expand**: one Edit that Opens and Resizes the Resource to fit its content, capped at the visible canvas area at the current zoom, displacing as a Resize does. The camera then frames it. Refines ADR 0122 (needs its own ADR). |
| `Space` | **Full-viewport**: a transient reading view. The Resource's content fills the canvas area with the Dock floating over it. Nothing is authored (Open, size, position and camera unchanged), it is not stored and has no URL. Read-only; Tab and the arrows go along the Graph inside it, swapping the Resource shown; `Space` or `Esc` leaves; `Enter` leaves and Opens the Resource on the canvas. |
| `P` | **Present from here**: start presenting the Active Graph at this Resource with fresh Traversal history (`openPresentation`). Off the Active Graph it does nothing, and its menu item is disabled with the reason. |
| `?` | A sheet of the current mode's keys. |

All three new actions also appear in the Resource's Actions menu.

While presenting: `PageDown` advances, `PageUp` retreats, `Home` returns to the Graph's start, alongside the existing arrows, `Space`, `Esc`, `S` and `N`.

## Out of scope

- Undo and Redo (`Mod+Z`): a domain change, parked as issue 09.
- Blackout (`B`/`.`) and fullscreen (`F`) while presenting: parked as issue 10.

## Delivery

Plain stacked PRs (not GitHub native stacks), one per issue in order 01 to 08, each based on the one before. Shortcuts are UI treatment, so they live here and in tests, not in ADRs (`docs/agents/workflow.md`); the exception is issue 05, which changes the Maps contract's R38.
