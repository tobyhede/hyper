import type { ResourceId } from '@project/core';
import { CANVAS_KEYS, keyBelongsElsewhere, OWNS_ITS_KEYS, type KeyBinding } from './key-bindings';
import type { KeyAnswer } from './key-dispatcher';

/**
 * Whether a command can run for a target, and if not, whether it is offered at all.
 *
 * `unavailable` is a command that exists here but cannot run now: its rail item
 * is drawn disabled with the reason, so the reader sees the command and why.
 * `absent` is a command this target does not have: no item is drawn. A key
 * answers only `available`; otherwise it stays silent and leaves the press alone.
 */
export type CommandAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'absent' };

export const AVAILABLE: CommandAvailability = { kind: 'available' };
export const ABSENT: CommandAvailability = { kind: 'absent' };
export const unavailable = (reason: string): CommandAvailability => ({
  kind: 'unavailable',
  reason,
});

/**
 * What a Canvas command's key is aimed at, which decides the guard it is
 * answered under and how its target is found.
 *
 * - `focused-resource`: the drawn Resource the press landed on, and never one
 *   of its own controls, content or toolbar, which keep their keys.
 * - `selection`: the selected Resource or Edge, from anywhere a surface that
 *   owns its keys does not hold the press.
 * - `canvas`: the drawn Map itself, under the same guard as `selection`.
 */
export type CanvasCommandAim = 'focused-resource' | 'selection' | 'canvas';

/** A Canvas command's name: its binding's, under the `canvas` context (ADR 0138). */
export type CanvasCommandId = `canvas.${keyof typeof CANVAS_KEYS}`;

/**
 * A named action on the canvas, which a key, a Resource's rail or both perform.
 *
 * The command is the one place its availability and its effect are written:
 * the dispatcher answers its key through it and the rail draws its item from
 * it, so the two cannot disagree about when it runs or what it reports.
 */
export interface CanvasCommand<Target> {
  readonly id: CanvasCommandId;
  readonly binding: KeyBinding;
  readonly aim: CanvasCommandAim;
  /** Whether it acts on the canvas's own Map only, or on any Map the canvas draws. */
  readonly serves: 'own-map' | 'any';
  readonly availability: (target: Target) => CommandAvailability;
  readonly run: (target: Target) => void;
}

/** A command bound to one target, as a rail item draws and runs it. */
export interface BoundCommand {
  readonly availability: CommandAvailability;
  readonly run: () => void;
}

/** `command` for `target`, its availability read now. */
export const bindCommand = <Target>(
  command: CanvasCommand<Target>,
  target: Target,
): BoundCommand => ({
  availability: command.availability(target),
  run: () => command.run(target),
});

/**
 * Where a paste, a file drop or a key aimed at a Resource is somebody else's,
 * not the canvas's.
 *
 * The canvas zoom controls render *inside* the canvas, as do every Resource's
 * own controls and editors, so a list naming only text entry would let a drop
 * on Zoom in place an image. It is the surfaces that own their keys
 * (`key-bindings.ts`) and every control besides. The `selection` and `canvas`
 * aims are guarded by `keyBelongsElsewhere` instead; the `focused-resource`
 * aim and Delete, which are aimed at a Resource itself, are guarded by this.
 *
 * **`.nokey` is the first entry and the load-bearing one.** Every portalled and
 * chrome surface in the tree already marks itself with it for React Flow's own
 * `useKeyPress` subscriptions, whose `isInputDOMNode` walks `closest('.nokey')`.
 * Reading the same marker is what stops this list drifting into a second,
 * hand-maintained copy of an exclusion the components already declare.
 */
export const NOT_A_CANVAS_COMMAND = `.nokey, input, button, ${OWNS_ITS_KEYS}`;

/** Whether the guard for `aim` leaves this press to whatever it landed on. */
const guardedFor = (aim: CanvasCommandAim, event: KeyboardEvent): boolean => {
  if (aim !== 'focused-resource') return keyBelongsElsewhere(event);
  return !(event.target instanceof Element) || event.target.closest(NOT_A_CANVAS_COMMAND) !== null;
};

/**
 * The key answer for `command`: past its aim's guard, at the target `targetOf`
 * finds for the press, and only while the command is available there.
 */
export function keyAnswerOf<Target>(
  command: CanvasCommand<Target>,
  targetOf: (event: KeyboardEvent) => Target | undefined,
): KeyAnswer {
  return {
    binding: command.binding,
    answer: (event) => {
      if (guardedFor(command.aim, event)) return false;
      const target = targetOf(event);
      if (target === undefined || command.availability(target).kind !== 'available') return false;
      command.run(target);
      return true;
    },
  };
}

/** The sentence Present from Here carries while the Active Graph does not hold its Resource. */
export const PRESENT_OFF_GRAPH = 'This Resource is not on the Active Graph.';

/**
 * The sentence Present from Here carries on the Active Graph while presenting is
 * withheld (`AuthoringAvailability.present`): a content edit or a rename holds
 * the keyboard, or an image replacement is running.
 */
export const PRESENT_WHILE_EDITING = 'Finish the edit in progress to present.';

/**
 * Presenting from a Resource: whether the Active Graph holds it
 * (`presentsFrom`), and the command. Absent on a canvas nothing presents from,
 * which includes a hidden Space's and one already presenting.
 */
export interface PresentFrom {
  readonly canPresentFrom: (resourceId: ResourceId) => boolean;
  readonly run: (resourceId: ResourceId) => void;
}

/**
 * Present from Here (`P`): present the Active Graph from a Resource of the
 * canvas's own Map. Off the Active Graph, or while presenting is withheld, it is
 * offered unavailable with the reason, the Active Graph's reason first.
 */
export function presentFromHereCommand(input: {
  readonly presentFrom: PresentFrom | undefined;
  /** `AuthoringAvailability.present` for the canvas's own Map. */
  readonly mayPresent: boolean;
}): CanvasCommand<ResourceId> {
  const { presentFrom, mayPresent } = input;
  return {
    id: 'canvas.presentFromHere',
    binding: CANVAS_KEYS.presentFromHere,
    aim: 'selection',
    serves: 'own-map',
    availability: (resourceId) => {
      if (presentFrom === undefined) return ABSENT;
      if (!presentFrom.canPresentFrom(resourceId)) return unavailable(PRESENT_OFF_GRAPH);
      return mayPresent ? AVAILABLE : unavailable(PRESENT_WHILE_EDITING);
    },
    run: (resourceId) => presentFrom?.run(resourceId),
  };
}
