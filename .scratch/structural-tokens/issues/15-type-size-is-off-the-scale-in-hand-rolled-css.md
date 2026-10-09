# 15: Type size is off the scale in hand-rolled CSS

**What to build:** Every `font-size` in a hand-rolled stylesheet under `packages/*/src` states a step from a named type scale, or is a recorded exception with its reason, and the structural scan's CSS arm fails a new bare one.

Type size is on the chrome's structural scale — `--text-chrome-2xs`/`-xs`/`-sm` in `tailwind.css`'s `@theme inline` — and the scan's class arm already fails a length-like `text-[…]`. Its CSS arm does not read `font-size` at all: ticket 08 named radius, border width, box-shadow and font weight, and type size was left out. A review of PR #266 found the gap; ticket 08's resolution records it among what the scan cannot see.

**The check is written.** The patch under **The check** at the end of this ticket adds `font-size` (and the `font` shorthand's size, a `var()` fallback included, read up to any `/` line height at parenthesis depth zero) to `test/unit/structural-css-literals.test.ts`. A value passes only as a CSS-wide keyword, a fully tokenised `var()`, or a `calc()` over tokenised `var()`s. Its fixtures failed on the code before it and pass with it. It is not applied because the tree holds eighteen bare `font-size` declarations (a grep over `packages/*/src/**/*.css` at `46a0b147`; the ticket was filed at seventeen), and none can move onto an existing step without changing what is drawn. The patch still applies cleanly (`git apply --check`, 2026-10-09).

**Chrome — nearest step, a small visual change each**

- `packages/app/src/components/resources-popover.css:63` `13px`, `.resources-popover__row` — `sm` is `0.85rem`. Ticket 01 already merged `13px` into `0.85rem`.
- `packages/app/src/components/resources-popover.css:90` `11px`, `.resources-popover__row-reason` (added since filing) — between `2xs` (`10px`) and `xs` (`0.75rem`).
- `packages/app/src/components/resources-popover.css:164` `11px`, `.resources-popover__count`, the count badge — the same gap.
- `packages/app/src/styles.css:356` `0.8rem`, `.canvas-refusal` — `xs` is `0.75rem`; ticket 01 moved `Command.tsx`'s `0.8rem` there.

`12px` equals `0.75rem` only while the root font size is 16px, and nothing in the app sets it, so no swap here is a guaranteed no-op.

**Resource surfaces — the Resource's own scale, which has no type steps for these**

- `packages/ui/src/canvas-resource.css:276` `12px` (`.canvas-resource__space-note`), `:398` `0.72rem` (`.resource__field-error`)
- `packages/ui/src/markdown-resource-body.css:58` `15px` (rendered body), `:191` `10px` (shortcut hint), `:226` `9px` (its `kbd`)
- `packages/ui/src/resource-image.css:35` `12px` (`.resource-image__url`), `:88` `0.75rem` (the replace field error) — both added since filing

The Resource's scale states `--canvas-resource-title-size` and two ratios off it (`canvas-resource.css:21-24`); none of these values is on it.

Not a `font-size` declaration, so the patched scan will not report it, but it states a bare size all the same: `packages/ui/src/markdown-resource-body.css:150` sets `--markdown-source-line-number-font-size: 12px`, which `MarkdownSourceEditor.tsx:81` reads as the gutter's `fontSize`. Decide it with the Resource scale.

**Dead — delete rather than tokenise**

- `packages/ui/src/resource-search-combobox.css:58` `15px`. `ResourceSearchCombobox` has had no consumer since reconnection went (`.scratch/edge-toolbar/issues/05`; AGENTS.md), so this is settled by deleting the component and its stylesheet, or left out of scope here, not by giving it a step.

**Relative units — candidate recorded exceptions**

- `packages/ui/src/stage.css:51` `3.4cqw`, `:57` `5cqw`, `:90` `4.2cqw` — the presenting Stage's type, sized to its container on purpose. This moved from `packages/app/src/styles.css` to the Stage stylesheet (ADR 0123).
- `packages/ui/src/stage.css:100` `0.9em`; `packages/ui/src/markdown-resource-body.css:72` `1.2em`, `:108` `0.9em` — code and headings sized relative to the body.

The two `.resource__title` sizes the ticket first listed (`0.95rem`, `1.3rem` in `styles.css`) are gone. The four `font: inherit` shorthands (`canvas-resource.css:254`, `:386`, `edge-title.css:34`, `inline-title-editor.css:36`) pass the patched check.

Line numbers are as of `46a0b147`; re-run the scan rather than trusting them.

**Decisions this ticket takes**

1. The four chrome sites: move each to its nearest step and record the delta, or add a step.
2. Whether the Resource gets a type-size scale beside its geometry (ticket 06), and its steps.
3. Whether container-relative (`cqw`) and body-relative (`em`) sizing are carve-outs, each with a reason.

These are decisions about what the product looks like, so they want an eye on them rather than a substitution.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [ ] Every `font-size` under `packages/*/src/**/*.css` states a named step or is a recorded carve-out with a reason
- [ ] The patch under **The check** is applied (or its equivalent), and the real-tree test passes
- [ ] Ticket 08's "cannot see" list no longer names `font-size`
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## The check

Written against `test/unit/structural-css-literals.test.ts` as it stood when this ticket was filed; apply with `git apply` from the repository root, or re-derive it if the file has moved on.

````diff
--- a/test/unit/structural-css-literals.test.ts
+++ b/test/unit/structural-css-literals.test.ts
@@ -46,6 +46,7 @@ const BORDER_PROPERTY =
   /^border(?:-(?:top|right|bottom|left|inline(?:-start|-end)?|block(?:-start|-end)?))?(?:-width)?$/u;
 const SHADOW_PROPERTY = /^box-shadow$/u;
 const FONT_WEIGHT_PROPERTY = /^font-weight$/u;
+const FONT_SIZE_PROPERTY = /^font-size$/u;
 const FONT_SHORTHAND_PROPERTY = /^font$/u;
 
 const isStructuralCssProperty = (property: string): boolean =>
@@ -53,6 +54,7 @@ const isStructuralCssProperty = (property: string): boolean =>
   BORDER_PROPERTY.test(property) ||
   SHADOW_PROPERTY.test(property) ||
   FONT_WEIGHT_PROPERTY.test(property) ||
+  FONT_SIZE_PROPERTY.test(property) ||
   FONT_SHORTHAND_PROPERTY.test(property);
 
 /**
@@ -145,10 +147,63 @@ const bareBorderWidths = (property: string, value: string): readonly string[] =>
  */
 const FONT_WEIGHT_LITERAL = /^(?:[1-9]00|bold|bolder|lighter)$/iu;
 
+/**
+ * The `font` shorthand's size sits beside its weight: a component that is a
+ * length, a percentage or a size keyword — bare or as a var() fallback, once
+ * `beforeLineHeight` has cut any line height away — states one. A weight is
+ * unitless, so it never reads as a size.
+ */
+const FONT_SIZE_LITERAL =
+  /^(?:-?[\d.]+[a-z%]+|(?:xx?-|xxx-)?(?:small|large)|medium|smaller|larger)$/iu;
+
+/**
+ * A shorthand size joined to its line height, `var(--size, 13px)/1.5`, is one
+ * component; the size is what precedes the `/` at parenthesis depth zero, so a
+ * var() fallback is read whole rather than cut short by the line height.
+ */
+const beforeLineHeight = (component: string): string => {
+  let depth = 0;
+  for (let index = 0; index < component.length; index += 1) {
+    const char = component.charAt(index);
+    if (char === '(') depth += 1;
+    if (char === ')') depth -= 1;
+    if (char === '/' && depth === 0) return component.slice(0, index);
+  }
+  return component;
+};
+
+/** A CSS-wide keyword defers to the cascade; it states no magnitude of its own. */
+const CSS_WIDE_KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer)$/iu;
+
+/**
+ * A `calc()` states no literal of its own when every operand is a tokenised
+ * var() — `calc(var(--size) * var(--ratio))`. A number or length operand is a
+ * literal like any other.
+ */
+const isTokenizedCalc = (value: string): boolean => {
+  const trimmed = value.trim();
+  if (!trimmed.startsWith('calc(') || !trimmed.endsWith(')')) return false;
+  return topLevelComponents(trimmed.slice('calc('.length, -1)).every(
+    (component) => /^[-+*/]$/u.test(component) || isFullyTokenized(component),
+  );
+};
+
 const isBareCssLiteral = (property: string, value: string): boolean => {
   if (BORDER_PROPERTY.test(property)) return bareBorderWidths(property, value).length > 0;
   if (FONT_SHORTHAND_PROPERTY.test(property)) {
-    return topLevelComponents(value).some(statesLiteral(FONT_WEIGHT_LITERAL));
+    return topLevelComponents(value).some((component) => {
+      const size = beforeLineHeight(component);
+      return (
+        statesLiteral(FONT_WEIGHT_LITERAL)(component) || statesLiteral(FONT_SIZE_LITERAL)(size)
+      );
+    });
+  }
+  if (FONT_SIZE_PROPERTY.test(property)) {
+    return !(
+      CSS_WIDE_KEYWORD.test(value.trim()) ||
+      isFullyTokenized(value) ||
+      isTokenizedCalc(value)
+    );
   }
   // radius, box-shadow and font-weight never mix a literal magnitude with a
   // var()-based colour the way a border shorthand does, so the whole value
@@ -411,11 +466,67 @@ describe('arm 2 — bare structural literal in CSS (fixture proof)', () => {
     expect(found).toHaveLength(2);
   });
 
-  it('ignores a font shorthand that states no weight', () => {
+  it('ignores a font shorthand that states no literal weight or size', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        '.x { font: inherit; }\n.y { font: var(--text-chrome-sm)/1.5 sans-serif; }\n.z { font: var(--canvas-resource-title-weight) var(--text-chrome-sm)/1.5 sans-serif; }',
+      ),
+    );
+    expect(found).toEqual([]);
+  });
+
+  it('reports a bare font-size, including one written as a var() fallback', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        [
+          '.a { font-size: 13px; }',
+          '.b { font-size: 0.85rem; }',
+          '.c { font-size: var(--x, 13px); }',
+          '.d { font-size: calc(var(--x) + 2px); }',
+        ].join('\n'),
+      ),
+    );
+    expect(found.map(({ line }) => line)).toEqual([1, 2, 3, 4]);
+  });
+
+  it('ignores a tokenised font-size, a calc() over tokens only, and a CSS-wide keyword', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        [
+          '.a { font-size: var(--text-chrome-sm); }',
+          '.b { font-size: calc(var(--canvas-resource-title-size) * var(--canvas-resource-subtitle-ratio)); }',
+          '.c { font-size: inherit; }',
+          '.d { font-size: unset; }',
+        ].join('\n'),
+      ),
+    );
+    expect(found).toEqual([]);
+  });
+
+  it('reports a bare size written inside the font shorthand, bare or as a var() fallback, a line height after it included', () => {
+    const found = findCssViolations(
+      'fixture.css',
+      maskCssComments(
+        [
+          '.a { font: 13px/1.5 sans-serif; }',
+          '.b { font: var(--canvas-resource-title-weight) 13px sans-serif; }',
+          '.c { font: var(--canvas-resource-title-weight) var(--x, 13px) sans-serif; }',
+          '.d { font: var(--x, 13px)/1.5 sans-serif; }',
+          '.e { font: var(--x, bold) var(--text-chrome-sm)/1.5 sans-serif; }',
+        ].join('\n'),
+      ),
+    );
+    expect(found.map(({ line }) => line)).toEqual([1, 2, 3, 4, 5]);
+  });
+
+  it('ignores a font shorthand whose size is tokenised', () => {
     const found = findCssViolations(
       'fixture.css',
       maskCssComments(
-        '.x { font: inherit; }\n.y { font: 1rem/1.5 sans-serif; }\n.z { font: var(--canvas-resource-title-weight) 1rem/1.5 sans-serif; }',
+        '.a { font: var(--canvas-resource-title-weight) var(--text-chrome-sm)/1.5 sans-serif; }',
       ),
     );
     expect(found).toEqual([]);
````

## Comments

### Triage, 2026-10-09

> *This was generated by AI during triage.*

**Category:** enhancement. **State:** ready-for-human.

Still valid. `test/unit/structural-css-literals.test.ts:46` still has no `font-size` arm, and the patch under **The check** still applies cleanly. The body's inventory was refreshed to the eighteen current sites at `46a0b147`. The presenting type moved to `packages/ui/src/stage.css`, the `.resource__title` sizes are gone, and three sites are new (`resources-popover.css:90`, `resource-image.css:35` and `:88`). The `--markdown-source-line-number-font-size: 12px` custom property, which the patched scan will not see, is now recorded. The dead `resource-search-combobox.css:58` site is marked for deletion rather than tokenising. The open decisions are visual and the human's: nearest step or a new step for the four chrome sites, whether the Resource gets type steps, and whether the `cqw` and `em` sizes are carve-outs.
