declare const publish: <Payload>(payload: Payload) => Payload;

interface CardDocument {
  readonly title: string;
}

/**
 * Must survive: broadening to `unknown` discards no proof — it is the one
 * containment an assertion rule has no business rejecting, because everything a
 * reader could do with the result requires parsing it first.
 *
 * The assertion is load-bearing rather than redundant: it pins `publish`'s
 * `Payload` to `unknown` instead of letting it infer `CardDocument`. It still
 * carries a `SAFETY:` comment, because ADR 0062 left
 * `anti-slop/require-safety-comment-for-type-assertion` untouched and it applies
 * to every surviving assertion, broadening ones included.
 */
export const publishOpaquely = (document: CardDocument): void => {
  // SAFETY: broadening only — the result is opaque and must be parsed to be read.
  void publish(document as unknown);
};
