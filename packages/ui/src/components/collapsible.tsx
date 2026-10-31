import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

/**
 * The shadcn `base-nova` registry's `collapsible`, unchanged: three slots over
 * Base UI's Collapsible, which owns the disclosure's `aria-expanded`,
 * `aria-controls` and whether the panel is mounted.
 */
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
