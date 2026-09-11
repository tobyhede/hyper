import { useState } from 'react';
import type { Thing, ThingId } from '@project/core';
import type { ThingChoice } from '@project/ui';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { thingChoiceOf } from '#src/thing-choice';
import type { SelectedEdgeRefusal } from '#src/edge-authoring';
import { SelectedEdgeControls } from '#components/SelectedEdgeControls';
import { authoredSpace } from './spaces';

/**
 * The Things the endpoint pickers offer: the tracked story Space's own.
 *
 * A hand-written list would be the transcription ADR 0052 rules out — these come
 * from a Space that has been through the real intake, so a story cannot offer a
 * Thing the app would refuse to load.
 */
const SUBJECT_THINGS: readonly Thing[] = authoredSpace.things;

const THING_AT = (index: number): ThingId => {
  const thing = SUBJECT_THINGS[index];
  if (thing === undefined) throw new Error(`The story Space has no Thing ${index}.`);
  return thing.id;
};

/** The Edge these controls are drawn for: the first step of the story spine. */
export const STORY_EDGE = { from: THING_AT(0), to: THING_AT(1) } as const;

/** The Thing whose row is refused in the disabled-choice story. */
export const DUPLICATE_TARGET = THING_AT(2);

export interface SelectedEdgeFixtureProps {
  /**
   * Whether the endpoint editor opens with the story.
   *
   * The production prop is controlled by Edge Authoring, which owns the draft;
   * this fixture stands in for that owner and nothing else, so a Ladle spec can
   * still press Edit and Escape and watch the same prop move.
   */
  readonly editorOpen?: boolean;
  /**
   * The structured refusal the surface is handed — never finished prose.
   *
   * Passing an `AuthoringRefusal` through is what makes the story evidence of
   * ADR 0057's mapping rather than of a sentence someone typed into a fixture:
   * the copy, the channel and the Field are all derived by the production
   * adapters underneath.
   */
  readonly refusal?: SelectedEdgeRefusal | null;
  /**
   * A Thing an endpoint may not move to, and the refusal that says why.
   *
   * Answered through the production `thingChoiceOf`, the same translation the
   * canvas runs over `edgeEligibility` — so the disabled row and its reason are
   * derived here exactly as they are on a real canvas.
   */
  readonly ineligible?: {
    readonly thingId: ThingId;
    readonly refusal: 'edge-already-exists';
  } | null;
}

const choices = (ineligible: SelectedEdgeFixtureProps['ineligible']): readonly ThingChoice[] =>
  SUBJECT_THINGS.map((thing) =>
    thingChoiceOf(
      thing,
      ineligible?.thingId === thing.id
        ? { kind: 'refused', refusal: { code: ineligible.refusal } }
        : { kind: 'eligible' },
    ),
  );

/**
 * The unchanged production controls, framed for the catalogue.
 *
 * No canvas: the surface takes domain facts and callbacks and nothing from React
 * Flow, which is the point of the extraction. Spatial placement over the real
 * routed Edge is the application evidence's half (ADR 0052).
 */
export function SelectedEdgeFixture({
  editorOpen = false,
  refusal = null,
  ineligible = null,
}: SelectedEdgeFixtureProps) {
  const [open, setOpen] = useState(editorOpen);
  const [reconnected, setReconnected] = useState(STORY_EDGE);

  return (
    <div className="flex min-h-[22rem] items-start justify-center bg-background p-[3rem] text-foreground">
      <SelectedEdgeControls
        from={reconnected.from}
        to={reconnected.to}
        editorOpen={open}
        endpointChoices={() => choices(ineligible)}
        refusal={refusal}
        onOpenEditor={() => setOpen(true)}
        onCloseEditor={() => setOpen(false)}
        onReconnect={(endpoint, thingId) => {
          setReconnected((edge) => ({ ...edge, [endpoint]: thingId }));
          setOpen(false);
        }}
        onDelete={() => setOpen(false)}
      />
    </div>
  );
}
