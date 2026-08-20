# Structured authoring refusals in React forms

## Conclusion

The current shape is clunky for a real reason: shadcn's `Field` is a composition and styling
primitive, not an error-routing system. It does not decide whether an application refusal belongs
to `title`, `target`, or the whole form. That decision belongs in the application presentation
boundary, after Authoring has returned a stable domain refusal and before the pane renders it.

A good local shape is one derived presentation value, for example:

```ts
type NewAliasErrors = {
  readonly fields: {
    readonly title?: string;
    readonly target?: string;
  };
  readonly form?: string;
};
```

`presentNewAliasRefusal(refusal)` should produce that complete pane-specific model. `NewAlias`
then only binds `errors.fields.title` and `errors.fields.target` to their respective `Field`s and
renders `errors.form` once. This is less error-prone than scattering placement comparisons through
JSX, and it does not require storing derived error state: React recommends calculating render data
from props/state during render rather than synchronizing another state variable or Effect
([React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)).

This recommendation is an architectural inference from the sources below, not a rule stated by
React or shadcn.

## What the primary sources establish

### Field errors are field-local

- shadcn says to put `data-invalid` on the `Field`, `aria-invalid` on the control, and render
  `FieldError` immediately after the control or inside `FieldContent`. Its documented composition is
  `Field -> label -> control -> description -> error`
  ([shadcn Field: Validation and Errors](https://ui.shadcn.com/docs/components/radix/field#validation-and-errors)).
- WAI recommends inline feedback at or near the corresponding control. A field can be associated
  with its error using `aria-describedby`, and corrective text should explain how to fix the value
  ([WAI Forms Tutorial: User Notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)).
- `aria-invalid` communicates that the control's value failed validation; `aria-describedby`
  supplies the associated explanatory text. They solve different parts of the problem and should
  be used together for a field failure
  ([WAI technique ARIA21](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA21.html),
  [APG: Providing Accessible Descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/#describingbyreferencingcontentwitharia-describedby)).
- An `aria-describedby` value is a space-separated ID reference list, so existing help/empty-state
  descriptions and an error description should be composed rather than one silently replacing the
  other
  ([WAI-ARIA 1.2: `aria-describedby`](https://www.w3.org/TR/wai-aria-1.2/#aria-describedby)).

Therefore `card-title-required` belongs beside and programmatically associated with the Title
control when that control exists. Moving it to generic form copy loses the field association even
if the text remains visible.

### Form errors are a distinct channel

WAI distinguishes inline feedback from overall feedback. Overall failures may be presented in a
prominent alert/error summary; field failures should still be associated with their controls
([WAI Forms Tutorial: User Notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)).
In this pane, stale Layout/placement/operation failures that no input can repair are form-level;
Title and Target validation failures are field-level.

React also distinguishes expected returned submission state from exceptional thrown failures:
returned action state can render a message, while a thrown action failure is handled by an Error
Boundary ([React `<form>`: Handling form submission errors](https://react.dev/reference/react-dom/components/form#handling-form-submission-errors)).
An Authoring refusal is therefore expected UI state, not a reason to crash an event handler.

### Base UI can route external field errors, but only when using its Form/Field system

Base UI's `Form` accepts external errors as an object whose keys correspond to `Field.Root` names,
and its examples return server/schema errors as such a field-keyed map. `Field.Root` also supports
controlled `invalid` state and `Field.Error` renders that field's validation message
([Base UI Form](https://base-ui.com/react/components/form),
[Base UI Field](https://base-ui.com/react/components/field)).

That API validates the error-bag model, but it is not automatically available merely because a
project uses shadcn components built in the style of Base UI. Hyper's current shadcn `Field` is a
plain composition primitive, so adopting Base UI `Form` solely to remove a few bindings would be a
larger architectural change, not a required best practice.

## Where mapping should live

Keep these responsibilities separate:

1. **Authoring/domain:** return a discriminated `AuthoringRefusal` with stable semantic identity and
   any domain data. It should not know React IDs, component names, or English copy.
2. **Application presentation:** exhaustively translate the refusal into copy and semantic/pane
   placement. A pane-specific adapter should produce its complete `fields`/`form` error bag.
3. **React component:** derive that bag during render and bind each field message to `data-invalid`,
   `aria-invalid`, `aria-describedby`, and the adjacent `FieldError`.

The exhaustive translation should be centralized, not repeated in JSX. TypeScript explicitly
documents discriminated unions plus `never` as the way to make a `switch` fail at compile time when
a new variant is added
([TypeScript Handbook: Exhaustiveness checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking)).
Exhaustiveness is appropriate for the refusal-to-presentation boundary. It is not a reason to throw
for a known refusal at runtime; the `never` check is chiefly a compile-time obligation.

## Recommendation for `NewAlias`

- Keep accepting the complete `AuthoringRefusal`; this preserves the no-crash behavior.
- Replace the component's catch-all `targetError`/everything-else branching with one pure,
  pane-specific `presentNewAliasRefusal` returning `{ fields, form }`.
- Bind Title and Target independently and render only `form` outside the field group.
- Keep `aria-describedby` composition inside the reusable control where it knows every description
  it owns; callers should add their error ID without erasing the control's existing description.
- Test observable semantics: the matching field is invalid and described by its adjacent error;
  an operation-level refusal is announced as form feedback; unrelated fields remain valid.

No new form library is necessary for this fix. If many panes later repeat the same binding
mechanics, a small project UI helper that accepts a field error is a narrower change than replacing
the forms with Base UI `Form`.
