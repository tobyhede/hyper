import { useState } from 'react';
import {
  authoringAvailability,
  type AuthoringAvailability,
  type AuthoringInProgress,
} from './authoring-availability';

/** The facts availability reads that the editing surfaces do not report. */
export type AuthoringFacts = Omit<
  AuthoringInProgress,
  'editingResourceBody' | 'editingResourceTitle' | 'editingChromeTitle'
>;

export interface AuthoringAvailabilityState {
  readonly availability: AuthoringAvailability;
  /** Whether a Resource's content edit is running, reported up by the canvas. */
  readonly editingResourceBody: boolean;
  readonly setEditingResourceBody: (editing: boolean) => void;
  readonly setEditingResourceTitle: (editing: boolean) => void;
  /** Reported by the Dock while one of its names is being renamed in place. */
  readonly setEditingChromeTitle: (editing: boolean) => void;
}

/**
 * What may be authored right now — one question, answered once, spent by every
 * surface and by the canvas (`CONTEXT.md`, Availability) — and the three
 * editing reports it is answered from.
 *
 * The reasons each answer carries live in `authoring-availability.ts`, beside
 * the answer they govern, so two surfaces reading the same operation cannot
 * disagree about it.
 *
 * Two facts end a chrome rename that is not the author ending it, and both are
 * read as **render-time transitions rather than effects**, since an effect
 * would draw one frame of a rename that had already stopped being available:
 *
 * - **A replacement discards every open Interaction draft (ADR 0042).** The
 *   report is cleared here and the editor itself by the Dock's rename slot,
 *   which is handed the same epoch — so the withdrawal the report drives comes
 *   back in the same render as the replacement.
 * - **A chrome rename that is no longer available ends.** The Dock's rename
 *   slot reads the same fact the same way (`useDockRenaming`), so the surface
 *   and the composition agree about when a draft ends.
 */
export function useAuthoringAvailability(
  facts: AuthoringFacts,
  replacementEpoch: number,
): AuthoringAvailabilityState {
  const [editingResourceBody, setEditingResourceBody] = useState(false);
  const [editingResourceTitle, setEditingResourceTitle] = useState(false);
  const [editingChromeTitle, setEditingChromeTitle] = useState(false);
  const availability = authoringAvailability({
    ...facts,
    editingResourceBody,
    editingResourceTitle,
    editingChromeTitle,
  });
  const [renameEpoch, setRenameEpoch] = useState(replacementEpoch);
  if (renameEpoch !== replacementEpoch) {
    setRenameEpoch(replacementEpoch);
    if (editingChromeTitle) setEditingChromeTitle(false);
  } else if (editingChromeTitle && !availability.chromeTitleEdit) {
    setEditingChromeTitle(false);
  }
  return {
    availability,
    editingResourceBody,
    setEditingResourceBody,
    setEditingResourceTitle,
    setEditingChromeTitle,
  };
}
