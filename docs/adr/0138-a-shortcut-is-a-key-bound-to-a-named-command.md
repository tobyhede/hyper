# A shortcut is a key bound to a named command, and a reader's remapping stays in their browser

Status: proposed

Every key the application answers is declared once, in `packages/app/src/key-bindings.ts`, and that table drives the handlers, `aria-keyshortcuts`, the tooltips and the `?` sheet. But the table names keys, not actions: each binding is matched by the handler that performs it, and those handlers listen separately (the canvas adds its own window `keydown` listener for each of `C`, `P`, `F2` and Delete). So a key cannot be changed without changing the code that answers it, and nothing can turn a key off. Single-character keys such as `C`, `P`, `N`, `S` and `?` are answered anywhere on the canvas except in text controls, menus and dialogs, which is wider than focus on one component, so WCAG 2.1.4 (Character Key Shortcuts) asks that a reader can turn them off or remap them.

**A shortcut is a key bound to a named command.** Each action a key performs is a command with a stable id, such as `canvas.presentFromHere`. A command knows nothing of its key. The **keymap** is data: for each command, the keys and presses that perform it and the context it is answered in (the canvas, Full View, presenting, or everywhere). The defaults are the binding table as it stands, and they are code.

**One dispatcher answers the keys.** It reads each `keydown` once, applies the one guard (`keyBelongsElsewhere`), resolves the press against the effective keymap for the context the Space is in, and runs that command. No command adds a listener of its own. `aria-keyshortcuts`, the tooltips and the `?` sheet read the effective keymap, so a remapped key is announced as it is answered.

**A reader's changes are overrides on the defaults, kept in that browser.** An override replaces the keys of one command, or turns a command's keys off. Overrides are one `localStorage` entry, parsed strictly where they are read: an unknown command id or a malformed entry is dropped and the default stands, and storage that throws or is empty leaves the defaults. They apply in every Space and every mount in that browser, and nothing in the repository reads or writes them. The one switch WCAG 2.1.4 needs is an override too: turning off single-character shortcuts turns off every binding whose key is a single letter, number, punctuation or symbol character, which are the keys 2.1.4 covers.

**Some keys are not remappable.** `Escape` keeps its dismiss-and-unselect meaning wherever a primitive gives it one, and `Tab` stays the browser's. A binding another component performs, such as React Flow's Shift+arrow nudge and its Escape unselect, is listed in the sheet but cannot be remapped while that component performs it. A key bound twice in one context is refused when the override is made, naming the command that already holds it; the same key may mean different commands in different contexts, as the arrows already do on the canvas and while presenting.

## Considered options

- **Keep one listener per command, and make each read its key from the table.** Rejected: every listener repeats the guard and the context test, so a remap or an off switch has to be honoured in every one of them, and a new key added without it escapes both.
- **Keep overrides in the talk's aggregate (`aggregate.json`).** Rejected: keys are the reader's habit, not the talk's. Every reader of a shared talk would get its author's keys, and a talk would no longer open as it was committed, which is the rule ADR 0131 gives a mounted talk's own edits.
- **A hotkey library (`tinykeys`, `react-hotkeys-hook`).** Rejected as the design: they match key strings to callbacks, which `pressesBinding` already does, and they do not own contexts, announcement or overrides. Taking one would put a second table beside ours.
- **Only the WCAG switch, with no remapping.** This meets 2.1.4 by turning keys off, and it is the smaller change. It is not taken on its own because the reader who turns `P` off to type freely loses the command's key, where a remap keeps it.

## Consequences

The command ids become the names tests and the sheet use for an action. The editor's Save and Cancel in `@project/ui`'s `MarkdownResourceBody` stay outside the keymap, because `ui` cannot depend on the application's table. Overrides are per browser by design: another browser, a private window or cleared site data starts from the defaults.
