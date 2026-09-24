import { titleName, type Resource } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { describeAuthoringRefusal, describeConnectChoice } from '../authoring-refusal';
import { connectChoices, type ConnectTarget, type EdgeAuthoring } from '../edge-authoring';
import { ResourcesPopover } from './ResourcesPopover';

/** Which Resource a Connect list is open for, and the control it hangs from. */
export interface Connecting {
  readonly from: Resource;
  /** The Actions trigger whose menu ran Connect to Resource. */
  readonly anchor: HTMLElement | null;
}

export interface ResourceConnectProps {
  /** `null` while no list is open. */
  readonly connecting: Connecting | null;
  /** The Resources the selected Map places. */
  readonly placed: readonly Resource[];
  readonly edgeAuthoring: EdgeAuthoring;
  /** The next projection, merged into the live nodes by a completed connection. */
  readonly projectedNodes: readonly ResourceFlowNode[] | null;
  readonly onClose: () => void;
}

/**
 * A Resource's Connect list: the keyboard way to draw an Edge, as the Resources
 * list in its `connect` purpose. One per canvas, since only one is ever open.
 *
 * Choices are asked on every render rather than cached at open, and completion
 * asks again, so a row made stale by a Space change is refused by the Edit
 * (`ResourcesPopover.test.tsx`).
 */
export function ResourceConnect({
  connecting,
  placed,
  edgeAuthoring,
  projectedNodes,
  onClose,
}: ResourceConnectProps) {
  const from = connecting?.from ?? null;
  const choices = from === null ? null : connectChoices(from.id, placed, edgeAuthoring.eligibility);
  const refusals = new Map(
    (choices?.resources ?? []).map(({ resource, refusal }) => [
      resource.id,
      refusal === null ? null : describeAuthoringRefusal(refusal),
    ]),
  );
  const newResourceRefusal = choices?.newResource ?? null;
  const draw = (target: ConnectTarget): string | null =>
    from === null
      ? null
      : describeConnectChoice(edgeAuthoring.connectTo(from.id, target, projectedNodes));
  return (
    <ResourcesPopover
      purpose="connect"
      from={from === null ? '' : `Resource ${titleName(from.title)}`}
      anchor={connecting?.anchor ?? null}
      open={from !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="bottom"
      resources={(choices?.resources ?? []).map(({ resource }) => resource)}
      allResources={placed}
      refusalOf={(resource) => refusals.get(resource.id) ?? null}
      onConnect={(resource) => draw({ kind: 'resource', resourceId: resource.id })}
      newResource={{
        refusal: newResourceRefusal === null ? null : describeAuthoringRefusal(newResourceRefusal),
        onConnect: () => draw({ kind: 'new-resource' }),
      }}
    />
  );
}
