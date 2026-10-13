import type { KindId } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';

/**
 * How a kind is created from the Command Dock, declared by the kind's app half
 * over a context of its own: what its press runs, and what it may be withheld on.
 *
 * Every Create is withheld while Add Resource is, so a kind can only narrow
 * that answer, never widen it.
 */
export interface KindCreation<Context> {
  /** Whether this kind's own Create is withheld now, beyond Add Resource's answer. */
  readonly withheld?: (context: Context) => boolean;
  /**
   * Run the press over the context it was drawn with. A Create that finishes
   * after an `await` reads `later()` there instead: the context as it stands
   * then, or `null` once this Create may no longer run. A rejection is
   * reported as a break.
   */
  readonly create: (context: Context, later: () => Context | null) => void | Promise<void>;
}

/** What a Create is drawn with: its kind's context and Add Resource's answer. */
export interface CreateConditions<Context> {
  readonly context: Context;
  readonly addResource: boolean;
}

/** What a Create reads after its press. */
export interface CreateContinuation<Context> {
  /** The conditions as they stand now, or `null` once the Dock that drew the Create has gone. */
  readonly current: () => CreateConditions<Context> | null;
  readonly reportBreak: ObserverErrorReporter;
}

/** One Create the Command Dock draws: the kind it makes, whether it may run, and the press. */
export interface DockCreate {
  readonly kind: KindId;
  readonly disabled: boolean;
  /** Runs the kind's Create, or nothing when it is withheld. */
  readonly create: () => void;
}

/**
 * The Creates the Dock draws, one per kind that declares one, in the order
 * given. Whether each may run is answered once for the render, and both the
 * control and its press read that one answer, so they cannot disagree; a
 * Create that continues after its press asks again then.
 */
export function dockCreates<Context>(
  creations: readonly (readonly [KindId, KindCreation<Context>])[],
  conditions: CreateConditions<Context>,
  { current, reportBreak }: CreateContinuation<Context>,
): readonly DockCreate[] {
  return creations.map(([kind, creation]) => {
    const runnable = ({ context, addResource }: CreateConditions<Context>): boolean =>
      addResource && !(creation.withheld?.(context) ?? false);
    const available = runnable(conditions);
    const later = (): Context | null => {
      const now = current();
      return now !== null && runnable(now) ? now.context : null;
    };
    return {
      kind,
      disabled: !available,
      create: () => {
        if (!available) return;
        const running = creation.create(conditions.context, later);
        if (running instanceof Promise) running.catch(reportBreak);
      },
    };
  });
}
