/**
 * The two set-trigger treatments, in a module of their own.
 *
 * **They are here and not in the Dock's component modules because those
 * modules' other exports are components.** A non-component export beside them
 * costs the module its Fast Refresh boundary, and `RESOURCES_TRIGGER` has to
 * be exported: the Resources surface is the caller's whole component —
 * trigger and panel together — so the treatment has to travel to whoever supplies it (`App.tsx`, and the
 * catalogue's `CommandDockFixture`).
 */
/**
 * A control that names a **set** and discloses it: `[glyph] Name ⌄`, in one
 * button.
 *
 * **One construction, because there are two of these and they drifted.** Resources
 * and the open-spaces-menu-at-the-root are the same shape and were built twice: one
 * carried `gap-1.5` from its own disclosure and the other carried none, so the same
 * arrangement of glyph, word and chevron came out spaced two different ways.
 * That is the sort of difference nobody writes down and everybody sees.
 *
 * The button itself is the caller's, because the two sit in different
 * containers — Resources is in a `Toolbar` and takes a `ToolbarButton`, the
 * Open Spaces menu is in a `Breadcrumb` and cannot, since Base UI's toolbar button
 * throws outside a `Toolbar.Root`. What has to match is the size, the classes
 * and the order of the parts, so those are {@link SET_TRIGGER} and this, and a
 * caller supplies neither.
 *
 * A set has no name to edit, so the word lives inside the trigger rather than
 * being replaced by an editor. The three identities disclose the same way
 * (`.scratch/command-dock/issues/26-identity-clusters-disclose-from-the-name.md`);
 * what still separates these two is that a set has no Rename command.
 */
export const SET_TRIGGER = {
  className: 'nokey command-dock__name',
  size: 'compact',
} as const satisfies { className: string; size: 'compact' };

/**
 * The treatment the Resources cluster's trigger takes, for whoever supplies the
 * surface.
 *
 * Exported because {@link DockResources.surface} is the caller's whole component —
 * trigger and panel together — and the trigger, which
 * `CommandDockResources.tsx`'s `ResourcesTrigger` labels, still has to be one of the Dock's four names: the same size, the same classes and
 * the same parts in the same order, so the word lands in the column the other
 * three land in and the vertical dock's grid can place its chevron.
 *
 * Two classes rather than one: it stands in the name slot like the other three,
 * and it is the one trigger carrying its own disclosure inside it.
 */
export const RESOURCES_TRIGGER = {
  // The Dock's own class leads the template rather than trailing it, and that
  // ordering is load-bearing for the catalogue rather than for CSS. A class in a
  // template's *tail* is invisible to `ui-catalog.ts`'s dead-rule scan — it
  // reads a template's head and middles and cannot know where a substitution's
  // value ends — so `command-dock__resources-trigger` written last read as a rule no
  // production module names. `cn` would say it too, and costs this file its
  // constant export and so its Fast Refresh boundary.
  className: `command-dock__resources-trigger ${SET_TRIGGER.className}`,
  size: SET_TRIGGER.size,
  /**
   * The name, stated rather than left to the trigger's own contents.
   *
   * `ResourcesTrigger` draws a Resource glyph, the word, and a chevron — and the glyph
   * announces its kind, so a name computed from the contents reads "Markdown
   * Resource Resources", which is a set named after one of its members. It still
   * *contains* the visible label, which is what WCAG 2.5.3 and ADR 0082 bind.
   */
  'aria-label': 'Resources',
  title: 'Resources in this Space',
} as const satisfies { className: string; size: 'compact'; 'aria-label': string; title: string };
