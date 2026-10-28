export interface KeyBinding {
  readonly module: `packages/${'app' | 'ui'}/src/${string}`;
  readonly sourceKey: string;
  readonly occurrence: number;
  readonly key: string;
  readonly surface: string;
  readonly behaviour: string;
}

/**
 * Every keyboard binding authored by InfinityCube in the app and UI packages that
 * reads `event.key` itself.
 *
 * The application's shortcuts are not here: they are declared as data in
 * `packages/app/src/key-bindings.ts` (`CANVAS_KEYS`, `PRESENTING_KEYS`), whose
 * own tests hold each one, and matched by `pressesBinding`. What that module
 * reads directly is its shared guard's deference to a focused control: the
 * Space and Enter that activate it, and the keys that move a slider's value.
 */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: ' ',
    occurrence: 1,
    key: 'Space',
    surface: 'Focused control under any application shortcut',
    behaviour: 'defer to native control activation',
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'Enter',
    occurrence: 1,
    key: 'Enter',
    surface: 'Focused control under any application shortcut',
    behaviour: 'defer to native control activation',
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'ArrowLeft',
    occurrence: 1,
    key: 'ArrowLeft',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'ArrowRight',
    occurrence: 1,
    key: 'ArrowRight',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'ArrowUp',
    occurrence: 1,
    key: 'ArrowUp',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'ArrowDown',
    occurrence: 1,
    key: 'ArrowDown',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'Home',
    occurrence: 1,
    key: 'Home',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'End',
    occurrence: 1,
    key: 'End',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'PageUp',
    occurrence: 1,
    key: 'PageUp',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/key-bindings.ts',
    sourceKey: 'PageDown',
    occurrence: 1,
    key: 'PageDown',
    surface: 'Focused slider or spin button under any application shortcut',
    behaviour: "defer to a focused slider's value movement",
  },
  {
    module: 'packages/app/src/presenting-keys.ts',
    sourceKey: 'PageDown',
    occurrence: 1,
    key: 'PageDown',
    surface: 'Presenting, with focus in content that scrolls',
    behaviour: 'defer to scrolling down until the content ends',
  },
  {
    module: 'packages/app/src/presenting-keys.ts',
    sourceKey: 'PageUp',
    occurrence: 1,
    key: 'PageUp',
    surface: 'Presenting, with focus in content that scrolls',
    behaviour: 'defer to scrolling up until the content starts',
  },
  {
    module: 'packages/app/src/presenting-keys.ts',
    sourceKey: 'Home',
    occurrence: 1,
    key: 'Home',
    surface: 'Presenting, with focus in content that scrolls',
    behaviour: 'defer to scrolling to the top until the content starts',
  },
  {
    module: 'packages/ui/src/MarkdownSourceEditor.tsx',
    sourceKey: 'Escape',
    occurrence: 1,
    key: 'Escape',
    surface: 'Markdown source editor',
    behaviour: 'withhold the Resource surface cancel key from CodeMirror',
  },
  {
    module: 'packages/ui/src/MarkdownSourceEditor.tsx',
    sourceKey: 'Mod-Enter',
    occurrence: 1,
    key: 'Mod-Enter',
    surface: 'Markdown source editor',
    behaviour: 'withhold the Resource surface commit chord from CodeMirror',
  },
  {
    module: 'packages/ui/src/MarkdownResourceBody.tsx',
    sourceKey: 'Escape',
    occurrence: 1,
    key: 'Escape',
    surface: 'Markdown Resource body',
    behaviour: 'cancel Markdown editing',
  },
  {
    module: 'packages/ui/src/MarkdownResourceBody.tsx',
    sourceKey: 'Enter',
    occurrence: 1,
    key: 'Mod-Enter',
    surface: 'Markdown Resource body',
    behaviour: 'commit Markdown editing',
  },
  {
    module: 'packages/ui/src/ImageReplaceTarget.tsx',
    sourceKey: 'Escape',
    occurrence: 1,
    key: 'Escape',
    surface: 'Image Resource upload target',
    behaviour: 'cancel replacing the image',
  },
  {
    module: 'packages/ui/src/InlineTitleEditor.tsx',
    sourceKey: 'Enter',
    occurrence: 1,
    key: 'Enter',
    surface: 'Inline title editor',
    behaviour: 'complete the title edit',
  },
  {
    module: 'packages/ui/src/InlineTitleEditor.tsx',
    sourceKey: 'Escape',
    occurrence: 1,
    key: 'Escape',
    surface: 'Inline title editor',
    behaviour: 'cancel the title edit and restore surface focus',
  },
  {
    module: 'packages/app/src/edge-authoring-react.tsx',
    sourceKey: 'Alt',
    occurrence: 1,
    key: 'Alt',
    surface: 'Edge authoring',
    behaviour: 'modify an empty drop into a new Resource connection',
  },
  {
    module: 'packages/app/src/edge-authoring-react.tsx',
    sourceKey: 'Enter',
    occurrence: 1,
    key: 'Enter',
    surface: 'Edge',
    behaviour: "move focus from the focused Active Graph Edge into its toolbar's first command",
  },
  {
    module: 'packages/app/src/components/AuthorableEdge.tsx',
    sourceKey: 'Escape',
    occurrence: 1,
    key: 'Escape',
    surface: 'Edge toolbar and Title',
    behaviour: 'return focus from the Edge chrome to the Edge',
  },
];
