import type { EmptyCreatableKindId, KindId } from '@project/core';

/**
 * Open the browser's file picker offering these media types, answering the
 * files chosen. A cancelled picker answers nothing, and never rejects.
 *
 * It reaches outside the process, so it is supplied when an opened Space is
 * composed (`compose-app.ts`) and a test supplies answers of its own. A caller
 * must call it inside the press that asked for it, before any `await`: a
 * browser opens a picker only within a user's gesture.
 */
export type PickFiles = (accept: string) => Promise<readonly File[]>;

/** The commands a kind's Create may run, and the one fact a kind may withhold it on. */
export interface CreationCommands {
  /** Create a Resource of a kind that starts empty: one completed Edit, then the naming continuation. */
  readonly createResource: (kind: EmptyCreatableKindId) => void;
  /** Create Space Resource: one press, one Resource, one new Space. */
  readonly createSpaceResource: () => void;
  /** Whether a Create Space Resource is between its press and its installed Edit. */
  readonly creatingSpaceResource: boolean;
  /** Create Image Resources from chosen files, at the visible centre. */
  readonly createImagesFromFiles: (files: readonly File[]) => void;
  readonly pickFiles: PickFiles;
}

/**
 * How a kind is created from the Command Dock, declared by the kind's app half.
 *
 * Every Create is withheld while Add Resource is, so a kind can only narrow
 * that answer, never widen it.
 */
export interface KindCreation {
  /** Whether this kind's own Create is withheld now, beyond Add Resource's answer. */
  readonly withheld?: (commands: CreationCommands) => boolean;
  readonly create: (commands: CreationCommands) => void;
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
 * given. Whether each may run is answered once, and both the control and its
 * press read that one answer, so they cannot disagree.
 */
export function dockCreates(
  creations: readonly (readonly [KindId, KindCreation])[],
  commands: CreationCommands,
  addResource: boolean,
): readonly DockCreate[] {
  return creations.map(([kind, creation]) => {
    const available = addResource && !(creation.withheld?.(commands) ?? false);
    return {
      kind,
      disabled: !available,
      create: () => {
        if (available) creation.create(commands);
      },
    };
  });
}
