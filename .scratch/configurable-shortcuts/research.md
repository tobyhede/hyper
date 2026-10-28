# Keyboard shortcut best practices: a review checklist for React and React Flow apps

The review checklist for Hyper's keyboard work: proposed ADR 0138 (a shortcut is a key bound to a named command), this directory's configurable-shortcuts tickets and the Canvas commands tickets in `.scratch/canvas-commands/`. Each practice has an ID (`BP-*`) that a review can cite. It was first applied to PR #436; that review is not repeated here.

Researched 2026-10-28. This is a checklist for reviewing a keyboard shortcut implementation in a React app built on `@xyflow/react` v12. The React Flow claims were checked against the published source of `@xyflow/react` 12.12.0 (with `@xyflow/system` 0.0.83) and 12.11.2 (with `@xyflow/system` 0.0.79), the version this repo pins. Claims about tldraw 5.5.2, Excalidraw (`master`), tinykeys 4.0.1, react-hotkeys-hook 5.3.3, Mousetrap 1.6.5 and kbar 1.0.0 come from their source code. **[DISAGREE]** marks a point where the sources contradict each other. **[INFERENCE]** marks a recommendation that I derived and that no source states.

## Summary

- **Use one dispatcher and one table.** A single `keydown` listener reads one binding table. The table maps stable command ids to bindings, each with a "when" predicate (its scope). It is the only source for the help sheet, tooltips, menus and `aria-keyshortcuts`. Excalidraw, tldraw, VS Code and kbar all follow this pattern. Calling `useHotkeys` separately in each component does not.
- **Suppress shortcuts on editable targets and during IME composition.** Skip events from editable targets (`input`, `textarea`, `select`, `isContentEditable`, which covers CodeMirror). Skip events during composition (`isComposing || keyCode === 229`). Skip events another handler already handled (`defaultPrevented`). Call `preventDefault()` only when a command actually ran.
- **Match on `event.key` and fall back to `event.code`.** Match the produced character (`event.key`) first. Fall back to the physical key (`event.code`) only when `key` is not ASCII, as tldraw and Excalidraw do. VS Code dispatches on the physical key instead **[DISAGREE]**. `Mod` means ⌘ on macOS and Ctrl elsewhere. Auto-repeat is ignored unless the command opts in.
- **Meet WCAG 2.1.4 for character-only shortcuts.** Any shortcut made only of printable characters (letters, `?`, digits) must be able to be turned off, remapped to include Ctrl, Alt or Meta, or be active only while its component has focus. In practice this means a setting that turns all character-only shortcuts off, as GitHub and tldraw provide.
- **React Flow has its own keyboard handling.** It registers its own `document` and `window` listeners for Backspace (delete), Shift (selection box), Space (pan) and Meta or Ctrl (multi-select and zoom). It also handles Enter, Space and Escape on focused nodes and edges, and arrow keys for moving nodes. Each of these is either disabled explicitly (`null` or `disableKeyboardA11y`) or deliberately left on, and the app's dispatcher must not handle the same keys twice.

---

## 1. Architecture

**BP-ARCH-1: Use one keydown listener per document.**
- **Practice:** All app shortcuts go through one `keydown` listener per document or editor root. Components do not add their own `window` or `document` key listeners for app commands. Local widget keys handled in JSX `onKeyDown` (arrow keys in a listbox, Enter in a form) are fine.
- **Why:** Separate listeners cannot see each other. Their order depends on which component mounted first, conflicts go undetected, and nothing can list every shortcut.
  - Excalidraw routes every action through one `ActionManager.handleKeyDown`.
  - tldraw's `useKeyboardShortcuts` builds one registry and attaches one listener to `body`.
  - kbar collects every action's `shortcut` into a single tinykeys map.
- **Check:** `grep -rn "addEventListener('keydown'\|addEventListener(\"keydown\"\|useHotkeys(\|tinykeys(" src`. Expect one hit for the dispatcher, plus any hits that are justified. Each additional hit is a finding.
- **Sources:** [Excalidraw manager.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx), [tldraw useKeyboardShortcuts.ts](https://www.npmjs.com/package/tldraw) (`src/lib/ui/hooks/useKeyboardShortcuts.ts` in the package), [kbar](https://www.npmjs.com/package/kbar) (`lib/InternalEvents.js`, `useShortcuts`).

**BP-ARCH-2: Keep commands separate from bindings.**
- **Practice:** A command has a stable string id (for example `graph.next`), a label and a `run` function. A binding is the data `{ key, command, when?, args? }`. Commands never contain key strings.
- **Why:** Remapping, the help sheet and conflict detection all need bindings to be data. VS Code's `keybindings.json` rules are exactly `{ key, command, when, args }`, and removing a binding is the rule `-command`.
- **Check:** Look for a `commands` registry and a separate `defaultBindings` table, keyed by command id. Key literals such as `'k'` or `'Mod+z'` should appear only in the bindings table, not in command or component files.
- **Sources:** [VS Code keybindings](https://code.visualstudio.com/docs/configure/keybindings).

**BP-ARCH-3: Use declarative "when" predicates, not if-chains in handlers.**
- **Practice:** Each binding declares when it is active (`canvasFocused && !presenting`) as a predicate over one context object. The dispatcher evaluates these predicates. Handlers do not test context and then return early.
- **Why:** If the scope lives inside the handler, the help sheet cannot show which shortcuts apply now, and conflicts cannot be found statically.
  - VS Code: "A `when` clause evaluates to either true or false for enabling keyboard shortcuts."
  - Excalidraw: each action has a `keyTest(event, appState, elements, app)` plus `viewMode` and `navigation` flags.
  - tldraw: `areShortcutsDisabled(editor)` checks open menus, an editing shape, a crash, and the user's preference.
- **Check:** Each binding entry carries a `when` (or scope). The handlers in the commands file do not read focus or modal state just to decide whether to run.
- **Sources:** [VS Code when clauses](https://code.visualstudio.com/api/references/when-clause-contexts), [Excalidraw manager.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx), [tldraw useKeyboardShortcuts.ts](https://www.npmjs.com/package/tldraw).

**BP-ARCH-4: Resolve overlaps deterministically, and test for them.**
- **Practice:** If two bindings could match the same event in the same context, the conflict is reported at build or test time. At runtime the result is deterministic: either an explicit priority or a refusal with a dev warning. It never depends on which handler registered first.
- **[DISAGREE] The libraries do not agree:**
  - VS Code evaluates rules bottom-to-top, and the first rule whose `key` and `when` match wins.
  - tinykeys: the first matching key in object order wins.
  - Excalidraw sorts by `keyPriority` and then cancels with `console.warn("Canceling as multiple actions match this shortcut")` if more than one action still matches.
  - tldraw runs every registration whose key matches, with no conflict detection.
- **Check:** There is a unit test that walks the default table and asserts that no two bindings share a normalised key while their `when` predicates can both be true. At minimum, it checks pairs with the same scope.
- **Sources:** [VS Code keybindings](https://code.visualstudio.com/docs/configure/keybindings), [tinykeys README, "Keybinding Priorities"](https://www.npmjs.com/package/tinykeys), [Excalidraw manager.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx).

**BP-ARCH-5: Expose one invocation path.**
- **Practice:** Shortcuts, menus, toolbar buttons and the command palette all call the same `runCommand(id)`, with the same enabled check. A shortcut for a disabled command does nothing and does not call `preventDefault`.
- **Why:** MDN on `aria-keyshortcuts`: "Keyboard shortcuts applied to disabled elements should also be disabled." Excalidraw records each invocation with its source (`"keyboard"`, `"ui"` or `"api"`) and passes it through the same `perform`.
- **Check:** The dispatcher calls the same function that the menu and button `onClick` handlers call. No command logic is duplicated inside the key handler.
- **Sources:** [MDN aria-keyshortcuts](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts), [Excalidraw manager.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx).

**BP-ARCH-6: Scope the listener to the app root when several instances can share a page.**
- **Practice:** If a component (for example a canvas) can appear more than once on a page, or be embedded in a host page, its dispatcher listens on its own container, or it checks that focus is inside its root. A `document` listener is used only with an explicit opt-in.
- **Why:**
  - Excalidraw listens on its container unless `handleKeyboardGlobally` is set.
  - tldraw registers only while `editor.getInstanceState().isFocused` is true.
  - React Flow's `useKeyPress` listens on `document` by default. Two flows on one page therefore both react to Backspace (see BP-RF-3).
- **Check:** The listener target is the app root, or the dispatcher checks `root.contains(event.target)` or a focus flag. A second instance must not respond to a key pressed in the first.
- **Sources:** [Excalidraw App.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/components/App.tsx), [tldraw useKeyboardShortcuts.ts](https://www.npmjs.com/package/tldraw), [React Flow useKeyPress](https://reactflow.dev/api-reference/hooks/use-key-press).

## 2. Scoping and focus

**BP-SCOPE-1: Suppress shortcuts in text-entry targets, and define "text entry" precisely.**
- **Practice:** If the event target is a text entry control, shortcuts without modifiers are skipped. The check:
  - takes the target from `event.composedPath()[0]` (so it works with shadow DOM);
  - treats `isContentEditable` as text entry, which covers CodeMirror's `.cm-content`;
  - treats `textarea` and text-like `input` elements that are not `readOnly` as text entry;
  - treats `select` as text entry.

  Non-text inputs (`checkbox`, `radio`, `range`, `button`, `color`, `file`, `submit`, `reset`) do not block shortcuts. A modifier shortcut is allowed inside an editor only if the binding opts in.
- **[DISAGREE] Implementations differ in which targets they treat as text entry:**
  - tldraw's `shouldSkipEvent` lets non-text inputs and read-only fields through.
  - React Flow's `isInputDOMNode` blocks all `INPUT`, `SELECT` and `TEXTAREA`, any element with a `contenteditable` attribute (including `contenteditable="false"`), and anything inside `.nokey`.
  - Mousetrap and react-hotkeys-hook block form tags and contentEditable by default.
  - tinykeys blocks editable targets unless the target is the listener's own `currentTarget`.
- **Check:** There is one `isTextEntryTarget(event)` helper, and the dispatcher calls it before matching. Unit tests cover `input[type=text]`, `input[type=checkbox]`, `textarea[readonly]`, a `contenteditable` div and a mounted CodeMirror editor.
- **Sources:** [tldraw useKeyboardShortcuts.ts](https://www.npmjs.com/package/tldraw), [@xyflow/system isInputDOMNode](https://www.npmjs.com/package/@xyflow/system), [react-hotkeys-hook README](https://www.npmjs.com/package/react-hotkeys-hook), [Mousetrap stopCallback](https://www.npmjs.com/package/mousetrap), [tinykeys README, `options.ignore`](https://www.npmjs.com/package/tinykeys).

**BP-SCOPE-2: Ignore IME composition.**
- **Practice:** The first check in the dispatcher is `if (event.isComposing || event.keyCode === 229) return;`.
- **Why:** MDN: "`compositionstart` may fire *after* `keydown` when typing the first character that opens up the IME, and `compositionend` may fire *before* `keydown` when typing the last character… `isComposing` is false even when the event is part of composition. However, `keyCode` is still `229`." tinykeys and tldraw check `isComposing`. React Flow's `useKeyPress` checks neither.
- **Check:** Look for both conditions, not only `isComposing`. A test sends `{key:'Enter', isComposing:true}` and `{key:'Process', keyCode:229}` and asserts that no command ran.
- **Sources:** [MDN keydown event](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event), [MDN isComposing](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing).

**BP-SCOPE-3: Respect events that are already handled (`defaultPrevented`).**
- **Practice:** The dispatcher listens in the bubble phase and returns early when `event.defaultPrevented` is true.
- **Why:** Focused widgets (menus, comboboxes, CodeMirror, React Flow nodes) handle their keys first. CodeMirror calls `preventDefault` on keys its keymap handles, but calls `stopPropagation` only when the binding opts in. Without this check, a document dispatcher would also run Mod+Z on the canvas while the editor undoes text. **[INFERENCE]** from the CodeMirror `KeyBinding` docs.
- **Check:** The listener has no `{capture:true}` (or a written reason for it), and `defaultPrevented` is checked before matching.
- **Sources:** [CodeMirror KeyBinding](https://codemirror.net/docs/ref/#view.KeyBinding), [MDN addEventListener capture](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener).

**BP-SCOPE-4: Do not swallow keys on the way down.**
- **Practice:** The app does not call `stopPropagation()` or `stopImmediatePropagation()` in a capture listener on `window` or `document`. Bubble-phase handlers call `stopPropagation` only for a key they consumed, and the reason is recorded.
- **Why:**
  - React Flow's built-in keys use `document` and `window` listeners (`useKeyPress`). A stop applied above them silently disables delete, selection and pan.
  - react-aria's `useKeyboard` "stopped [propagation] by default if there is an event handler, unless `event.continuePropagation()` is called". Code built on it can hide keys from the dispatcher.
  - Excalidraw calls both `preventDefault` and `stopPropagation` after an action runs.
- **Check:** `grep -rn "stopPropagation\|stopImmediatePropagation" src`. Each hit on a keyboard path needs a justification. No hit may be in a capture listener.
- **Sources:** [react-aria useKeyboard](https://react-aria.adobe.com/useKeyboard), [React Flow source, useKeyPress](https://www.npmjs.com/package/@xyflow/react).

**BP-SCOPE-5: Overlays take over scope.**
- **Practice:** While a modal dialog, menu, popover or command palette is open, canvas and global character shortcuts are inactive, apart from a short allowlist (for example Escape). Shortcuts come back when it closes.
- **Why:** tldraw's `areShortcutsDisabled` returns true when `editor.menus.hasAnyOpenMenus()`. The WAI APG warns against shortcuts that conflict with widget keys.
- **Check:** Overlays add a context key such as `overlayOpen`, or push a scope. Default bindings include `!overlayOpen` (or are scoped). A test opens a menu, presses a canvas letter shortcut, and asserts that nothing happened.
- **Sources:** [tldraw useKeyboardShortcuts.ts](https://www.npmjs.com/package/tldraw), [WAI-ARIA APG, Keyboard Shortcuts](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#keyboardshortcuts).

**BP-SCOPE-6: Handle shadow DOM and iframes.**
- **Practice:** The target is read from `event.composedPath()[0]` and not from `event.target`, because shadow DOM retargets events to the host. The dispatcher does not assume that keys typed in an iframe reach the parent document. If an iframe needs shortcuts, it posts them to the parent, or the parent installs a listener in the iframe.
- **Why:** Mousetrap's comment: "Events originating from a shadow DOM are re-targetted and `e.target` is the shadow host". React Flow's `isInputDOMNode` reads `composedPath()[0]`.
- **Check:** Look for `composedPath` in the target helper.
- **Sources:** [Mousetrap](https://www.npmjs.com/package/mousetrap), [@xyflow/system](https://www.npmjs.com/package/@xyflow/system).

## 3. Key matching

**BP-KEY-1: Match on `key`, fall back to `code` for non-Latin layouts.**
- **Practice:** Letters and punctuation are matched on `event.key`, lower-cased. Only when `event.key` is not printable ASCII (Cyrillic, Greek, Hebrew, CJK, or macOS Option dead keys) does the matcher fall back to the US-QWERTY letter for `event.code`. Positional bindings (for example "the key left of Backspace") use `code` explicitly.
- **Why:** MDN: `code` "represents a physical key… the same `code` value also represents the `'` key on Dvorak keyboards and the `A` key on AZERTY keyboards." tldraw: matching on `code` "breaks alternative Latin keyboard layouts (Dvorak, Colemak, AZERTY)". Excalidraw's `matchKey` has the same rule, with a table showing that Ctrl+Z on Russian gives `key:'я'` and `code:'KeyZ'`.
- **[DISAGREE] The rest of the field differs:**
  - VS Code dispatches on `code` (scan codes) on macOS and Linux, and on `keyCode` on Windows. It explains: "We cannot dispatch on `e.key` because the keys that produce combining accents would be unmappable". It offers `[KeyA]` syntax for layout-independent rules.
  - react-hotkeys-hook matches `code` unless `useKey: true`.
  - tinykeys accepts either.
  - Figma uses per-layout binding tables, chosen from the Keyboard API layout map.
- **Check:** The matcher has a `key` path and a guarded `code` fallback. Tests cover:
  - AZERTY: `{key:'a', code:'KeyQ'}` matches `a`, not `q`.
  - Dvorak: `{key:'o', code:'KeyS'}` matches `o`.
  - Russian: `{key:'я', code:'KeyZ', ctrlKey:true}` matches `Mod+z`.
- **Sources:** [MDN KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code), [UI Events code spec](https://www.w3.org/TR/uievents-code/), [Excalidraw keys.ts](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/common/src/keys.ts), [tldraw](https://www.npmjs.com/package/tldraw) (`useKeyboardShortcuts.ts`, `matchesEvent`), [VS Code Keybinding Issues wiki](https://github.com/Microsoft/vscode/wiki/Keybinding-Issues), [VS Code keybindings, "Keyboard layout-independent bindings"](https://code.visualstudio.com/docs/configure/keybindings), [Figma blog](https://www.figma.com/blog/behind-the-scenes-international-keyboard-shortcuts/).

**BP-KEY-2: Define one rule for Shift-produced characters, and normalise CapsLock.**
- **Practice:** A binding for a shifted character (`?`, `+`, `>`) is written as the character, and the matcher handles Shift consistently. There are two options:
  - (a) Match the produced `key` (`'?'`) and ignore `shiftKey` for non-letter characters.
  - (b) Use tldraw's table that maps shifted US glyphs back to their base keys (`'?'` → `shift+/`), applied the same way to both parsed bindings and events.

  CapsLock is normalised: letters compare lower-cased, and the Shift state is taken from `shiftKey`, not from the letter's case.
- **Why:**
  - MDN: with Shift+2, `key` "is set to the string `@` for the U.S keyboard type and `"` for the UK keyboard type".
  - tldraw matches digits held with Shift by `code` ("shift+2 is '@' on US, '"' on British PC and German").
  - Excalidraw wraps the event in a Proxy so that "CapsLock inverts capitalization… invert it back".
- **[DISAGREE] Two conventions conflict:**
  - ARIA requires `aria-keyshortcuts` to list the keys pressed ("Shift+2", not "@"), but that is layout-specific.
  - Option (b) assumes US glyph pairs.
- **Check:** One `normalize(event)` function, used by both matching and recording. Tests cover `?` (US Shift+/), CapsLock with `k` (`{key:'K', shiftKey:false}` matches `k`), and Shift+digit.
- **Sources:** [MDN KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key), [tldraw](https://www.npmjs.com/package/tldraw), [Excalidraw App.tsx onKeyDown](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/components/App.tsx), [MDN aria-keyshortcuts](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts).

**BP-KEY-3: Match modifiers exactly.**
- **Practice:** A binding matches only if `ctrlKey`, `metaKey`, `altKey` and `shiftKey` each equal what the binding declares, unless the binding marks a modifier as optional. A plain `k` binding must not fire on Ctrl+K or Meta+K.
- **Why:** tldraw's `matchesEvent` compares all four flags. tinykeys rejects any extra modifier unless it is listed as optional (`[Shift]`). React Flow's `useKeyPress` instead requires the pressed-key set to equal the binding's size.
- **Check:** The matcher compares all four flags. A test checks that Ctrl+K does not trigger a `k` binding.
- **Sources:** [tldraw](https://www.npmjs.com/package/tldraw), [tinykeys README](https://www.npmjs.com/package/tinykeys).

**BP-KEY-4: Resolve `Mod` once per platform.**
- **Practice:** A `Mod` token resolves to Meta on macOS and Control elsewhere, through one `isMac` source that tests can inject. Display strings come from the same resolution (⌘ versus Ctrl).
- **Why:** CodeMirror: "`Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on other platforms". tinykeys `$mod` and Playwright `ControlOrMeta` mean the same.
- **[DISAGREE]** tldraw registers both `cmd+x` and `ctrl+x` on every platform. On macOS that turns Ctrl+X into a second alias.
- **Check:** There is one platform helper, and no `navigator.platform` or `userAgent` sniffing elsewhere. Tests run the matcher with Mac and with non-Mac.
- **Sources:** [CodeMirror KeyBinding](https://codemirror.net/docs/ref/#view.KeyBinding), [tinykeys README](https://www.npmjs.com/package/tinykeys), [Playwright Keyboard](https://playwright.dev/docs/api/class-keyboard).

**BP-KEY-5: Treat AltGr as its own case.**
- **Practice:** Do not bind Ctrl+Alt+character. On Windows, AltGr arrives as Ctrl+Alt and produces characters such as `{` or `@` on many layouts.
- **Why:** The VS Code wiki: "pressing `Ctrl+Alt+Digit7` results in `ctrlKey: true, altKey: true, key: "{"`". It advises removing Ctrl+Alt bindings that steal AltGr characters. tinykeys aliases AltGraph explicitly.
- **Check:** The default table has no `Ctrl+Alt+<printable>`, or each such entry has a written reason. The recorder warns about this combination (BP-REMAP-4).
- **Sources:** [VS Code Keybinding Issues](https://github.com/Microsoft/vscode/wiki/Keybinding-Issues), [tinykeys README, AltGraph](https://www.npmjs.com/package/tinykeys).

**BP-KEY-6: Declare auto-repeat per command.**
- **Practice:** Each command declares `repeat: true` or `false`, defaulting to false. Toggles, navigation such as "next slide", create and delete ignore `event.repeat`. Continuous actions (zoom, nudge) may allow it.
- **Why:** MDN: a held key keeps emitting `keydown` with `repeat` set to `true`.
  - tinykeys ignores every repeat.
  - tldraw allows only the registration that first matched a held key to repeat, so releasing Shift while Q is still held does not start firing `q`.
  - React Flow's `useKeyPress` does not check `repeat`.
- **Check:** The binding or command type has a `repeat` field, and the dispatcher checks `if (event.repeat && !binding.repeat) return`. A test holds a key (`{x>5}` in user-event) and expects one run.
- **Sources:** [MDN KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key), [tinykeys source](https://www.npmjs.com/package/tinykeys), [tldraw](https://www.npmjs.com/package/tldraw).

**BP-KEY-7: Call `preventDefault` only when a command ran.**
- **Practice:** `preventDefault()` is called after the match succeeds, the `when` check passes and the command is enabled. It is never called for a miss, a disabled command or a skipped target.
- **Why:** Calling it on a miss breaks typing and browser behaviour. tldraw and Excalidraw call it only inside a matched, enabled action. React Flow's `useKeyPress` calls it on any match, except on a plain key over a `BUTTON` or `A` element.
- **Check:** The dispatcher has exactly one `preventDefault`, placed after the command runs (or after the run guard passes). Tests: a disabled command leaves `defaultPrevented` false, and an enabled one sets it true.
- **Sources:** [tldraw](https://www.npmjs.com/package/tldraw), [Excalidraw manager.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx).

**BP-KEY-8: Avoid OS, browser and assistive technology combinations.**
- **Practice:** The defaults avoid:
  - any modifier plus Tab, Enter, Space or Escape;
  - Meta plus a single key;
  - Alt plus a function key;
  - CapsLock, Insert or Scroll Lock combinations, and Ctrl+Option combinations on macOS (screen reader modifier keys);
  - browser chords for print, find, address bar, refresh, bookmarks, history, and new or closed tabs and windows.

  Ctrl+W, T and N cannot be intercepted outside Keyboard Lock in fullscreen.
- **Why:** These are the WAI APG conflict lists. react-hotkeys-hook: "some browser shortcuts (e.g. `meta+w`) cannot be overridden". Firefox's tests show that Ctrl+T and N reach the page only under Keyboard Lock in fullscreen, and that the fullscreen-exit key is "unconditionally reserved".
- **Check:** A reserved-combo list lives in code and is used by both a default-table test and the recorder (BP-REMAP-4).
- **Sources:** [WAI-ARIA APG, Keyboard Shortcuts](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#keyboardshortcuts), [react-hotkeys-hook README](https://www.npmjs.com/package/react-hotkeys-hook), [Firefox keyboard-lock test](https://searchfox.org/firefox-main/source/browser/base/content/test/fullscreen/browser_fullscreen_keyboard_lock_reserved.js), [MDN aria-keyshortcuts (Control+P example)](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts).

**BP-KEY-9: Give sequences a timeout and resolve their prefixes.**
- **Practice:** If chords or sequences exist (`g i`, `Mod+K Mod+1`), they have a timeout of at least 1000 ms. Escape or a non-matching key cancels them. A prefix that is also a full binding is either rejected or resolved by a documented rule.
- **Why:** tinykeys' default timeout is 1000 ms, and it warns that "Setting this value too low (i.e. `300`) will be too fast for many of your users". It also logs a conflict when `a b` and `a b c` both exist. kbar sorts sequences longest-first to stop `t s` from also firing `s`.
- **Check:** The timeout constant is at least 1000. There is a test for prefix overlap.
- **Sources:** [tinykeys README](https://www.npmjs.com/package/tinykeys), [kbar](https://www.npmjs.com/package/kbar).

## 4. Accessibility

**BP-A11Y-1: Meet WCAG 2.2 SC 2.1.4 Character Key Shortcuts (Level A).** The criterion, verbatim:

> "If a keyboard shortcut is implemented in content using only letter (including upper- and lower-case letters), punctuation, number, or symbol characters, then at least one of the following is true:
> **Turn off:** A mechanism is available to turn the shortcut off;
> **Remap:** A mechanism is available to remap the shortcut to include one or more non-printable keyboard keys (e.g., Ctrl, Alt);
> **Active only on focus:** The keyboard shortcut for a user interface component is only active when that component has focus."

- **Scope:**
  - Shift does not take a shortcut out of scope: the Understanding document gives `?` (Shift+/) as covered.
  - Sequences such as `g a` are covered.
  - Listboxes and menus are exempt because their keys are active only on focus.
- **Check:**
  - (a) Every binding is classified by whether it has Ctrl, Alt or Meta.
  - (b) Every binding without one is either scoped to a focused component, as defined by the Understanding document, or switched off by a user setting.
  - (c) A remap that only adds Shift does not count. **[INFERENCE]** from the `?` example.
  - The documented failure is F99, and the sufficient technique is G217.
- **Sources:** [Understanding SC 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html).

**BP-A11Y-2: Provide a working "turn off character-key shortcuts" switch.**
- **Practice:** A user setting turns off all character-only shortcuts and keeps modifier shortcuts. The dispatcher reads the setting itself, so no individual binding can bypass it. Bindings needed for accessibility may be exempted explicitly, as tldraw's `isRequiredA11yAction` is.
- **Why:** This is the simplest way to satisfy SC 2.1.4.
  - GitHub: "You can disable character key shortcuts, while still allowing shortcuts that use modifier keys".
  - tldraw's `areShortcutsDisabled` checks `!editor.user.getAreKeyboardShortcutsEnabled()`.
- **Check:** The setting exists, is reachable without a pointer, persists (BP-REMAP-6), and a test shows `k` does nothing while Mod+K still works when it is off.
- **Sources:** [GitHub keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts), [tldraw](https://www.npmjs.com/package/tldraw).

**BP-A11Y-3: Derive every displayed shortcut from the effective bindings.**
- **Practice:** The help sheet, tooltips, menu items and `aria-keyshortcuts` are all rendered from the effective table (defaults plus overrides) through one formatter. A remap changes all of them.
- **Why:** MDN: "show the shortcut in menus and tooltips". tldraw renders its `kbd()` labels and its shortcuts dialog from the same action `kbd` strings that drive matching.
- **Check:** No hard-coded key labels in JSX (`grep "⌘\|Ctrl+"` in components). A test remaps a command and asserts that the tooltip text changes.
- **Sources:** [MDN aria-keyshortcuts](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts), [tldraw kbd-utils.ts](https://www.npmjs.com/package/tldraw).

**BP-A11Y-4: Open a shortcut sheet with `?`, available in every scope.**
- **Practice:** `?` opens a dialog that lists the shortcuts available in the current context, grouped by scope. The sheet is also reachable from a menu, because `?` is itself a character shortcut covered by BP-A11Y-1.
- **Why:** This is the convention in GitHub ("Typing ? … brings up a dialog box that lists the keyboard shortcuts available for that page"), Linear ("Press `?` to see the full list of shortcuts"), Excalidraw (`KEYS.QUESTION_MARK` opens help) and tldraw (shortcuts dialog).
- **Check:** There is a `help.shortcuts` command bound to `?`, plus a menu entry. The sheet is generated from the table (BP-A11Y-3).
- **Sources:** [GitHub](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts), [Linear](https://linear.app/enablement/guide/navigating-linear), [Excalidraw App.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/components/App.tsx).

**BP-A11Y-5: Use `aria-keyshortcuts` correctly, and only to describe.**
- **Practice:** Put `aria-keyshortcuts` only on the element the shortcut activates or focuses. The value lists modifiers first, joined with `+`, with alternatives separated by spaces. It must come from the effective binding, and it must be removed when the shortcut is turned off.
- **Why:** MDN: it "has no effect on the functionality of the page". "Modifier keys must be listed first". "it is written as `plus`" for the + key. List "the keys the user needs to press, not the outcome" ("Shift+2", not "@").
- **Caveats:** Screen reader support varies. Not every screen reader and browser combination announces it, so it does not replace the visible sheet. **[INFERENCE]** a11ysupport.io did not render here, so support was not confirmed.
- **Check:** Values come from the formatter, not literals. No `aria-keyshortcuts` remains on a disabled control or on a shortcut that is turned off.
- **Sources:** [MDN aria-keyshortcuts](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts).

**BP-A11Y-6: Account for screen reader browse mode and `role="application"`.**
- **Practice:** Do not rely on single-letter shortcuts reaching the page outside an application region. Screen readers in browse mode consume letters: NVDA's H "takes you to the next heading". Know that React Flow puts `role="application"` on its wrapper, which hands all keys inside it to the app. Make sure Tab, Escape and focus exit work there, and that content inside the canvas is not trapped.
- **Why:**
  - WebAIM describes browse mode versus focus mode.
  - MDN on `application`: "the web author is completely responsible for handling any and all keyboard input… The `Tab`, `Space` and `Enter` keys, as well as `Escape`, must be handled by the application". It adds that it "should be added to the lowest common container possible".
  - React Flow 12.12.0 renders `role: "application"` on `.react-flow`.
- **Check:** Escape and Tab leave the canvas or move within it predictably. Readable content (an opened Resource) is not inside the application region, or it carries `role="document"`. Character shortcuts outside the canvas are covered by BP-A11Y-2.
- **Sources:** [WebAIM NVDA](https://webaim.org/articles/nvda/), [MDN application role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/application_role), [React Flow source](https://www.npmjs.com/package/@xyflow/react).

**BP-A11Y-7: Shortcuts are never the only way.**
- **Practice:** Every command bound to a key is also reachable by Tab or a menu, and by pointer.
- **Why:** WAI APG: "Do not use keyboard shortcuts as a substitute for access via navigation." "Not all devices that depend on keyboard interfaces can support keyboard shortcuts."
- **Check:** For each command id in the table, there is a menu, Dock or button invocation (BP-ARCH-5).
- **Sources:** [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#keyboardshortcuts).

## 5. Remapping and customisation

**BP-REMAP-1: Store user overrides as differences from the defaults.**
- **Practice:** Persist only the user's differences, as a list of add and remove rules keyed by command id (VS Code's model: user rules are appended to defaults, and `"-command"` removes a default). The effective table is `defaults ⊕ overrides`, computed by a pure function.
- **Why:** New defaults and renamed keys in future releases still reach users who customised something else. "Reset all" is then simply deleting the overrides.
- **Check:** The storage schema holds overrides only, never a full table. There is a pure `effectiveBindings(defaults, overrides)` with unit tests, including an override for a command that no longer exists.
- **Sources:** [VS Code keybindings, "Removing a keyboard shortcut"](https://code.visualstudio.com/docs/configure/keybindings).

**BP-REMAP-2: Detect conflicts when the user rebinds.**
- **Practice:** When the user rebinds, the UI shows any existing binding with the same normalised key and an overlapping scope. The user can cancel, replace (which unbinds the other) or keep both, if scopes make that safe. A search by keystroke is available.
- **Why:** VS Code: "Show Same Keybindings", and filtering the editor by keystroke.
- **Check:** The rebinding flow calls the same conflict function as BP-ARCH-4. There is a test for the "replace unbinds the other" path.
- **Sources:** [VS Code keybindings, "Detecting keyboard shortcut conflicts"](https://code.visualstudio.com/docs/configure/keybindings).

**BP-REMAP-3: Offer reset per command and reset all.**
- **Practice:** Each changed command shows that it was modified and has "Reset". There is also "Reset all shortcuts".
- **Check:** Reset removes that command's override entries. It does not write the default back as an override.
- **Sources:** [VS Code keybindings](https://code.visualstudio.com/docs/configure/keybindings).

**BP-REMAP-4: Recording a key combination.**
- **Practice:** The recorder:
  - listens in a focused capture field;
  - calls `preventDefault` on each keydown while recording;
  - ignores keydowns of modifiers alone (`key` is Shift, Control, Alt or Meta) and waits for a non-modifier key;
  - ignores `repeat` and `isComposing`;
  - cancels on plain Escape without binding it;
  - rejects or warns about reserved combinations (BP-KEY-8) and Ctrl+Alt+character (BP-KEY-5);
  - stores the result through the same `normalize(event)` as matching (BP-KEY-2), with `Mod` normalised;
  - suspends the global dispatcher while recording.
- **Why:** VS Code's Define Keybinding "listens for key presses" and serialises them into a rule.
- **Check:** The recorder is a pure reducer over key events, with tests for Shift alone (keeps waiting), Escape (cancels), Mod+W (rejected) and AZERTY `a` (stores `a`). The dispatcher has a `recording` guard.
- **Sources:** [VS Code keybindings, "Keyboard layouts"](https://code.visualstudio.com/docs/configure/keybindings), [MDN KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).

**BP-REMAP-5: Validate and version stored overrides.**
- **Practice:** Stored data is `{ version: n, overrides: [...] }`, parsed with a strict schema when read. Unknown command ids and unparseable keys are dropped, and the rest are kept. A version mismatch runs a migration or falls back to defaults. Read failures never throw into rendering.
- **Why:** Stored data can be stale or hand-edited. In this repo, `anti-slop.md` and ADR 0062 require parsing at boundaries.
- **Check:** A schema parse exists at the read site, and there is a `version` field. Tests feed garbage, an old version, and a removed command id.
- **Sources:** [MDN Using the Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API).

**BP-REMAP-6: Handle `localStorage` failures and changes from other tabs.**
- **Practice:**
  - Every `getItem` and `setItem` is wrapped in `try`/`catch`. `SecurityError` can come from blocked storage or an opaque origin, and `QuotaExceededError` from private mode or a full store.
  - The app falls back to in-memory overrides.
  - A `storage` event listener re-reads and re-validates the overrides when another tab changes them.
- **Why:** MDN: "some browsers might give us an empty `localStorage` object with a quota of zero". `SecurityError` is thrown when "the user has configured the browsers to prevent the page from persisting data". The storage event "won't work on the same page that is making the changes".
- **Check:** No bare `localStorage.` call outside one adapter. The adapter has a `storage` listener that it removes on cleanup. There is a test with `setItem` throwing.
- **Sources:** [MDN Window.localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [MDN Using the Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API).

**BP-REMAP-7: Label keys for the user's layout.**
- **Practice:** Labels show the character the user's layout produces for a binding. For a binding on `code`, use `navigator.keyboard.getLayoutMap()` where it exists and fall back to the US name.
- **Why:** `getLayoutMap` is experimental and not Baseline, requires a secure context and can throw `SecurityError`. Figma uses it, plus a setting where the user picks a layout, after finding labels that showed "keys that certain keyboards lack".
- **Check:** The label formatter does not crash when `navigator.keyboard` is undefined.
- **Sources:** [MDN getLayoutMap](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap), [Figma blog](https://www.figma.com/blog/behind-the-scenes-international-keyboard-shortcuts/).

## 6. React Flow (`@xyflow/react` v12)

**BP-RF-1: Decide on every built-in key explicitly.** The `<ReactFlow>` props and their defaults in v12:

| Prop | Default | What it does |
|---|---|---|
| `deleteKeyCode` | `'Backspace'` | Deletes selected nodes and edges |
| `selectionKeyCode` | `'Shift'` | Hold to drag a selection box |
| `multiSelectionKeyCode` | `'Meta'` on macOS, `'Control'` elsewhere | Hold to click-select several elements |
| `zoomActivationKeyCode` | Same as above | Hold to zoom |
| `panActivationKeyCode` | `'Space'` | Hold to pan |
| `disableKeyboardA11y` | `false` | When true, disables arrow-key movement |
| `nodesFocusable`, `edgesFocusable` | `true` | Tab focus; Enter or Space selects |

Each key prop accepts `null` to turn it off, or an array of alternatives.

- **Check:** The `<ReactFlow>` element sets each of these explicitly, either to `null` because the app dispatcher owns the key, or to a value chosen for a stated reason. Relying on the defaults silently counts as a finding.
- **Sources:** [ReactFlow API reference](https://reactflow.dev/api-reference/react-flow).

**BP-RF-2: Know React Flow's focused-element keys.**
- **What React Flow does:**
  - A focused node or edge handles `Enter`, `' '` and `Escape` in its `onKeyDown` (`elementSelectionKeys`). Escape unselects; Enter or Space selects.
  - A selected, draggable node moves with the arrow keys, ×4 with Shift, and calls `preventDefault` on the arrow key.
  - The multi-selection rectangle does the same.
  - All of this is skipped when `isInputDOMNode` is true or when `disableKeyboardA11y` is set. The edge handler checks only `disableKeyboardA11y`.
  - Node movement is announced through an `aria-live` message.
  - The docs say: "If you set `disableKeyboardA11y={true}`, arrow-key movement is disabled (but tab-focus and selection still work)". However, the 12.12.0 source also skips the node's Enter, Space and Escape selection when the flag is set.
- **Practice:** The app's dispatcher must not also bind plain Enter, Space, Escape or arrows on the canvas without accounting for these handlers. React Flow runs first (on the focused element) and does not stop propagation.
- **Check:** The dispatcher's canvas bindings for these keys either skip when `event.target.closest('.react-flow__node, .react-flow__edge')`, or `disableKeyboardA11y` is set and the app reimplements the behaviour. Test the node-focused case.
- **Sources:** [React Flow Accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [@xyflow/react source](https://www.npmjs.com/package/@xyflow/react) (`NodeWrapper`/`EdgeWrapper` `onKeyDown`, `NodesSelection`).

**BP-RF-3: Know how `useKeyPress` works.**
- **What it does:**
  - Default target is `document`. The selection, pan and multi-selection keys use `window`.
  - It listens in the bubble phase. It does not check `isComposing` or `repeat`.
  - It matches `event.code` if the binding string is a code (`'MetaLeft'`), and otherwise `event.key`.
  - It calls `preventDefault` on a match unless `options.preventDefault === false`, or unless the key is a plain key over a `BUTTON` or `A` element.
  - It resets on window `blur` and `contextmenu`.
  - `actInsideInputWithModifier` defaults to `true`. The delete key is registered with `false`, so Backspace in an input never deletes, even with a modifier.
  - It returns a boolean, not an event. It suits held-key state (panning, multi-select) and not commands.
- **Practice:** Do not build app commands on `useKeyPress`. Use the app dispatcher.
- **Check:** `useKeyPress` is used only for held-key state, if at all.
- **Version note:** In 12.11.2, the version this repo pins, keys were split with `kc.replace('+', '\n')`, which replaces only the first `+`. A three-part binding such as `'Meta+Shift+z'` therefore does not parse correctly. 12.12.0 uses `/\+/g`.
- **Sources:** [useKeyPress API](https://reactflow.dev/api-reference/hooks/use-key-press), [@xyflow/react 12.11.2 and 12.12.0 dist](https://www.npmjs.com/package/@xyflow/react).

**BP-RF-4: Use the `nokey`, `nodrag`, `nowheel` and `nopan` class conventions.**
- **Practice:** Interactive content inside a node (inputs, CodeMirror, buttons) carries:
  - `nodrag`, so a pointer press does not start a node drag;
  - `nowheel`, so scrolling does not zoom;
  - `nopan`, so pointer events do not pan;
  - `nokey`, so React Flow's `isInputDOMNode` treats it as input. Deletion, arrow movement and node selection keys are then skipped, and a pointer down does not start a selection.

  `nokey` is a fixed string in `@xyflow/system`. It is not configurable and is not documented as a prop. The others are configurable through `noDragClassName`, `noWheelClassName` and `noPanClassName`.
- **Check:** Editable or scrollable regions rendered inside a node have the relevant classes. The app's text-entry helper (BP-SCOPE-1) also honours `.nokey`, so both layers agree.
- **Sources:** [ReactFlow API reference](https://reactflow.dev/api-reference/react-flow), [@xyflow/system isInputDOMNode](https://www.npmjs.com/package/@xyflow/system).

**BP-RF-5: Take over deletion through the app's command.**
- **Practice:** If deletion must go through the app's own Edit path (validation, undo, persistence), set `deleteKeyCode={null}` and bind Delete and Backspace in the dispatcher to the app's delete command. Alternatively, keep React Flow's key and gate it with `onBeforeDelete`. Do not do both.
- **Why:** React Flow deletes inside a `useEffect` when its key state flips, through `deleteElements`, outside the app dispatcher's `when` predicates and its preventDefault rule.
- **Check:** Exactly one path deletes on a key. A test presses Backspace with a node selected and asserts one deletion. Another test presses Backspace in a node's input and asserts no deletion.
- **Sources:** [@xyflow/react source](https://www.npmjs.com/package/@xyflow/react) (`useGlobalKeyHandler`), [ReactFlow API reference](https://reactflow.dev/api-reference/react-flow).

**BP-RF-6: Keep React Flow's announced instructions in line with the actual bindings.**
- **Practice:** If any built-in key is changed or disabled, override the matching `ariaLabelConfig` strings.
- **Why:** The default `node.a11yDescription.default` text says "Press delete to remove it", but the default `deleteKeyCode` is `'Backspace'`. If a key is remapped or set to `null`, the announced instructions become false.
- **Check:** `ariaLabelConfig` is set whenever `deleteKeyCode`, `disableKeyboardA11y` or selection behaviour differs from the defaults, and its text names the effective keys (from the formatter, BP-A11Y-3).
- **Sources:** [React Flow Accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [@xyflow/system defaultAriaLabelConfig](https://www.npmjs.com/package/@xyflow/system).

**BP-RF-7: Avoid conflicts over Space, Shift and Mod.**
- **Practice:** Do not bind an app command to plain Space, or to holding Shift or Mod, while `panActivationKeyCode`, `selectionKeyCode` or `multiSelectionKeyCode` use them. Do not treat Mod+click as a command when `multiSelectionKeyCode` is Mod.
- **Why:** React Flow tracks these as held state on `window`. An app binding on the same key fires alongside them.
- **Check:** The conflict test (BP-ARCH-4) includes React Flow's effective built-in keys as pseudo-bindings.
- **Sources:** [ReactFlow API reference](https://reactflow.dev/api-reference/react-flow).

## 7. Testing

**BP-TEST-1: Test the matcher as a pure function.**
- **Practice:** `match(normalizedEvent, table, context)` is pure. Its unit tests use plain `{key, code, ctrlKey, metaKey, altKey, shiftKey, repeat, isComposing, keyCode}` objects, so layout cases are cheap to cover: AZERTY, Dvorak, Russian, Shift+digit, CapsLock, AltGr and Mac versus non-Mac.
- **Why:** The browser drivers model a US layout. user-event's default key map "models a US keyboard". Playwright: "For characters that are not on a US keyboard, only an `input` event will be sent." Layout coverage has to be at this level.
- **Check:** The matcher module imports no DOM or React. Its tests contain layout fixtures.
- **Sources:** [user-event keyboard](https://testing-library.com/docs/user-event/keyboard), [Playwright Keyboard](https://playwright.dev/docs/api/class-keyboard).

**BP-TEST-2: Run focus scenarios through the real dispatcher.**
- **Practice:** Integration tests use `user.keyboard` against rendered components:
  - `{Control>}k{/Control}` for chords, and `[KeyQ]` for codes;
  - `{a>5/}` for repeat;
  - a `keyboardMap` for other layouts.

  Each test focuses a specific element first (input, textarea, CodeMirror, open menu, focused React Flow node, body) and asserts both that the command ran or did not run and the value of `defaultPrevented`.
- **Check:** There is one test per row of the scope matrix (target × scope × binding class), with a disabled command and the "shortcuts off" setting included.
- **Sources:** [user-event keyboard](https://testing-library.com/docs/user-event/keyboard).

**BP-TEST-3: Write end-to-end tests that are platform-neutral.**
- **Practice:** Playwright tests press `ControlOrMeta+K`, not a hard-coded `Meta`. Each shortcut that ships has at least one end-to-end test through the real canvas, including React Flow's own listeners.
- **Check:** `grep "Meta+\|Control+" e2e`. Hard-coded platform modifiers are findings unless the test is about a specific platform.
- **Sources:** [Playwright Keyboard](https://playwright.dev/docs/api/class-keyboard).

**BP-TEST-4: Test the table's invariants.**
- **Practice:** Table-level tests check:
  - no conflicting bindings (BP-ARCH-4);
  - no reserved combinations (BP-KEY-8);
  - every character-only binding is either focus-scoped or covered by the "off" switch (BP-A11Y-1);
  - every command id in the table exists;
  - the help sheet lists every binding (BP-A11Y-3).
- **Check:** These tests exist and iterate the real default table, not a fixture copy.

## 8. React mechanics

**BP-REACT-1: Subscribe once and read the latest values through a ref or Effect Event.**
- **Practice:** The dispatcher's `useEffect` adds the listener once, or when the target changes, and removes it in cleanup. Handlers and context are read through a ref updated each render, or through `useEffectEvent`. Re-subscribing on every render or every state change is a finding.
- **Why:** React: Effect Events "always 'see' the latest values from render… without re-synchronizing your Effect". React 19.2 lists `useEffectEvent` under its new features. tinykeys' README shows exactly this pattern. tldraw instead rebuilds its whole registry when its dependencies change, which works but re-subscribes.
- **Check:** The listener effect has a stable dependency list (target only). Command lookup happens at event time.
- **Sources:** [React useEffectEvent](https://react.dev/reference/react/useEffectEvent), [React 19.2](https://react.dev/blog/2025/10/01/react-19-2), [tinykeys README, "React Hooks Example"](https://www.npmjs.com/package/tinykeys).

**BP-REACT-2: Make cleanup idempotent under StrictMode.**
- **Practice:** Every `addEventListener` has a matching removal with the same function and the same `capture` flag, or uses an `AbortController` `signal`. Registering a scope or binding returns an unregister function. No module-level "registered" flag can break when the effect runs setup, cleanup, setup.
- **Why:** React: "When Strict Mode is on, React will also run **one extra setup+cleanup cycle in development for every Effect**." A missing cleanup shows up as a command firing twice.
- **Check:** A test mounts under `<StrictMode>`, presses the key once, and expects one run.
- **Sources:** [React StrictMode](https://react.dev/reference/react/StrictMode), [MDN addEventListener signal](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener).

**BP-REACT-3: Make priority explicit, not dependent on mount order.**
- **Practice:** If components contribute bindings or scopes (an overlay pushing a modal scope), the registry orders them by explicit priority or a scope stack. It never orders them by registration or effect order, because effects run children-first, and StrictMode and remounts reorder them.
- **Why:** tinykeys documents that "the order of your keybindings matters". Excalidraw uses an explicit `keyPriority`. VS Code uses an explicit rule order.
- **Check:** Registration takes a `priority` or `scope`. A test registers in both orders and gets the same winner.
- **Sources:** [tinykeys README](https://www.npmjs.com/package/tinykeys), [Excalidraw manager.tsx](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx).

**BP-REACT-4: Keep the context the predicates read current at dispatch time.**
- **Practice:** The context the `when` predicates read is current when the key is pressed. Read it from stores (`getState()`) at event time rather than from a render-time closure. An overlay sets its scope when it becomes interactive. If a key could arrive in the gap between mount and effect, set the scope in `useLayoutEffect` or synchronously in the open action. **[INFERENCE]**
- **Check:** Predicates read store snapshots at dispatch time, not variables captured during render.
- **Sources:** [React useEffectEvent](https://react.dev/reference/react/useEffectEvent).

---

## Sources

**Standards and platform documentation**
- W3C, Understanding SC 2.1.4 Character Key Shortcuts (WCAG 2.2): https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html
- W3C WAI-ARIA APG, Developing a Keyboard Interface (Keyboard Shortcuts): https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#keyboardshortcuts
- W3C UI Events KeyboardEvent code values: https://www.w3.org/TR/uievents-code/
- MDN:
  - KeyboardEvent.key: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
  - KeyboardEvent.code: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
  - KeyboardEvent.isComposing: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
  - keydown event: https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event
  - aria-keyshortcuts: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts
  - application role: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/application_role
  - addEventListener: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
  - Window.localStorage: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
  - Using the Web Storage API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
  - Keyboard.getLayoutMap: https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap
- WebAIM, Using NVDA: https://webaim.org/articles/nvda/
- Firefox keyboard-lock reserved-keys test: https://searchfox.org/firefox-main/source/browser/base/content/test/fullscreen/browser_fullscreen_keyboard_lock_reserved.js

**React and React Flow**
- React useEffectEvent: https://react.dev/reference/react/useEffectEvent
- React 19.2 release post: https://react.dev/blog/2025/10/01/react-19-2
- React StrictMode: https://react.dev/reference/react/StrictMode
- React Flow `<ReactFlow>` API: https://reactflow.dev/api-reference/react-flow
- React Flow useKeyPress: https://reactflow.dev/api-reference/hooks/use-key-press
- React Flow Accessibility: https://reactflow.dev/learn/advanced-use/accessibility
- @xyflow/react 12.11.2 and 12.12.0, @xyflow/system 0.0.79 and 0.0.83, published dist read directly: https://www.npmjs.com/package/@xyflow/react, https://www.npmjs.com/package/@xyflow/system

**Other apps and libraries**
- VS Code:
  - Keyboard shortcuts: https://code.visualstudio.com/docs/configure/keybindings
  - When clause contexts: https://code.visualstudio.com/api/references/when-clause-contexts
  - Keybinding Issues wiki: https://github.com/Microsoft/vscode/wiki/Keybinding-Issues
- CodeMirror KeyBinding: https://codemirror.net/docs/ref/#view.KeyBinding
- tldraw 5.5.2, read from the published `src/lib/ui/hooks/useKeyboardShortcuts.ts` and `kbd-utils.ts`: https://www.npmjs.com/package/tldraw
- Excalidraw:
  - keys.ts: https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/common/src/keys.ts
  - manager.tsx: https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/actions/manager.tsx
  - App.tsx: https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/components/App.tsx
- Figma, "Behind the scenes: international keyboard shortcuts": https://www.figma.com/blog/behind-the-scenes-international-keyboard-shortcuts/
- GitHub Docs, Keyboard shortcuts: https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts
- Linear, Navigating Linear: https://linear.app/enablement/guide/navigating-linear
- tinykeys 4.0.1 README and source: https://www.npmjs.com/package/tinykeys
- react-hotkeys-hook 5.3.3 README: https://www.npmjs.com/package/react-hotkeys-hook
- Mousetrap 1.6.5 source: https://www.npmjs.com/package/mousetrap
- kbar 1.0.0 source: https://www.npmjs.com/package/kbar
- react-aria useKeyboard: https://react-aria.adobe.com/useKeyboard
- Testing Library user-event keyboard: https://testing-library.com/docs/user-event/keyboard
- Playwright Keyboard: https://playwright.dev/docs/api/class-keyboard
