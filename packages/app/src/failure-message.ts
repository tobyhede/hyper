/**
 * What a thrown thing says, for the one sentence a surface shows about it.
 *
 * A `throw` can carry anything, which is why the type is `unknown` — the
 * caught-error boundary the parsing rules exempt, named on the type rather than
 * written at the parameter, the way `ObserverErrorReporter` and
 * `CardCreationBreak` name their own. It reads a message where there is one and
 * falls back to the value's own spelling where there is not, and it invents
 * nothing else: a rejection is not a refusal, and a refusal code is a stable
 * domain identity (ADR 0057) that nothing caught here answers to.
 *
 * Its own module because its callers have nothing else in common — a startup
 * that failed to render, a Layout deletion that rejected, and a creation whose
 * coordination broke — and the five copies of this expression that preceded it
 * were five places to fix a wording once.
 */
export type FailureMessage = (failure: unknown) => string;

/** @see FailureMessage */
export const failureMessage: FailureMessage = (failure) =>
  failure instanceof Error ? failure.message : String(failure);
