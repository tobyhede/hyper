import type { ComponentType, ReactNode } from 'react';
import type { ResourceContentEdit } from '../resource-content-edit';
import type { ResourceDisplay } from '../resource-display';

/** What a drawn Resource tells its kind's content view about the area it draws in. */
export interface CanvasArea {
  /** The Resource's name, for the content's accessible names. */
  readonly name: string;
  readonly display: ResourceDisplay;
  /** Whether the content is the Resource's own and not leaving, and so may be authored here (ADR 0070). */
  readonly authoring: boolean;
  /** Whether the Resource is selected, which is when its content offers an edit target (ADR 0102). */
  readonly selected: boolean;
  /** Begin authoring the content, when the Resource offers it. */
  readonly onBeginEdit: (() => void) | undefined;
  /** Publish the edit running inside the content, or `null` when none is. */
  readonly setContentEdit: (edit: ResourceContentEdit | null) => void;
}

/**
 * The view half of a Resource kind (ADR 0120): what a Resource of it
 * is called and drawn as, its operations with none offered, and what it draws
 * when presented. Each kind declares one under `kinds/`, and the registry is
 * the one place they are listed, so no surface names a kind (ADR 0128).
 */
export interface KindView<Operations, OwnContent = never> {
  /** What one Resource of this kind is called. */
  readonly name: string;
  /** What the Resources list calls this kind's Resources. */
  readonly listName: string;
  /** What a Reference Resource to one of this kind is called, when one may be a Target. */
  readonly referenceName?: string;
  /**
   * The silhouette this kind draws. Absent, the kind draws the glyph of the
   * Resource it shows with a badge on it, as a Reference Resource does.
   */
  readonly Glyph?: ComponentType<{ size?: number | undefined }>;
  /** What a Resource of this kind offers before the composition offers anything. */
  readonly bareOperations: Operations;
  /** What an Open Resource of this kind draws in its content area on a Map, when its content draws one. */
  readonly canvas?: (content: OwnContent, area: CanvasArea) => ReactNode;
  /** What a presented Resource of this kind draws below its name; absent, its name alone. */
  readonly presented?: (name: string, content: OwnContent) => ReactNode;
}
