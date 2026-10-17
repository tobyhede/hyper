import { useCallback } from 'react';
import type { Space } from '@project/graph';
// Through the package's own subpath imports, as `#components/*` already is.
import { canRetreat } from '#src/navigation';
import { usePresentingKeys } from '#src/presenting-keys';
import { PresentingStage } from '#components/PresentingStage';
import { useStoryNavigation } from './navigation';
import { useStoryPresentingWindow } from './presenting-window';
import { stageSpace } from './spaces';

export interface PresentingStageFixtureProps {
  /** The Space presented, the Stage Space unless a story names another. */
  readonly space?: Space;
  /** How many production `advance()` calls the story opens with, to reach a later Resource. */
  readonly advances?: number;
  /** How wide the box the Stage fills is: a layout constraint and nothing more. */
  readonly width?: string;
  /** How tall the box the Stage fills is. */
  readonly height?: string;
}

/**
 * The production `PresentingStage` the application mounts, over real
 * Navigation presenting the Stage Space.
 *
 * The Resource on the Stage, the moves, Traversal history and every operation
 * come from Navigation, and the global Traversal keys are the production
 * listener, so a claim about the arrow keys reaching the traversal while the
 * frame's body has focus is a claim about the application's own binding.
 *
 * The box is a positioned region the Stage fills, standing where the
 * application's graph area stands; its size is the only thing the fixture
 * decides.
 */
export function PresentingStageFixture({
  space = stageSpace,
  advances = 0,
  width = '100%',
  height = '100vh',
}: PresentingStageFixtureProps) {
  const readSpace = useCallback(() => space, [space]);
  const { navigation, state } = useStoryNavigation(readSpace, (composed) => {
    composed.present();
    for (let step = 0; step < advances; step += 1) composed.advance();
  });
  const presenting = state.mode === 'presenting';
  const { presentingWindow, state: presentingState } = useStoryPresentingWindow(navigation);
  const { commands } = presentingWindow;
  usePresentingKeys(presenting, commands);
  const resourceId = navigation.activeResourceId();

  return (
    <div className="relative overflow-hidden" style={{ width, height }}>
      {presenting && resourceId !== null && (
        <PresentingStage
          space={space}
          mapId={state.selectedMapId}
          graphId={state.activeGraphId}
          resourceId={resourceId}
          moves={navigation.moves()}
          canRetreat={canRetreat(state)}
          onSelectBranch={commands.selectBranch}
          onAdvance={commands.advance}
          onRetreat={commands.retreat}
          onExit={commands.exitPresenting}
          onCopyLink={() => undefined}
          onOpenNotes={commands.openNotes}
          notesShown={presentingState.rehearsalNotesShown}
          onToggleNotes={commands.toggleNotes}
        />
      )}
    </div>
  );
}
