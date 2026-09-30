import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from './components/empty';
import { UnresolvedTargetIcon } from './icons';
import './unresolved-content.css';

/**
 * What a Reference Resource draws where its Target's content would be, when the
 * Target does not resolve. Intake refuses that Space, so no Space the
 * application loads reaches this; it is the content switch's answer for the one
 * kind that has no content, drawn as a notice rather than an empty document.
 */
export function UnresolvedContent() {
  return (
    <Empty className="unresolved-content" data-testid="unresolved-content">
      <EmptyHeader>
        <EmptyMedia>
          <UnresolvedTargetIcon size={24} />
        </EmptyMedia>
        <EmptyTitle>Target not found</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}
