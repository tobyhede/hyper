import type { Story } from '@ladle/react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardSection,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
  PersistenceIndicator,
  Separator,
  Spinner,
  Textarea,
} from '@project/ui';

export default { title: 'Design system' };

/** The real shared primitives, composed as future product surfaces will use them. */
export const Baseline: Story = () => (
  <div className="flex max-w-xl flex-col gap-6">
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem>Flow</MenubarItem>
            <MenubarItem>Grid</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>

    <Alert>
      <AlertTitle>Could not save the Space</AlertTitle>
      <AlertDescription>Try again after correcting the conflict.</AlertDescription>
    </Alert>

    <div className="flex items-center gap-2">
      <Badge>Active</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="destructive">Rejected</Badge>
      <Badge variant="outline">Reference</Badge>
      <PersistenceIndicator state="pending" />
      <PersistenceIndicator state="rejected" />
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Space settings</CardTitle>
        <CardDescription>Shared Card composition for a bounded product surface.</CardDescription>
      </CardHeader>
      <CardSection>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="design-system-title">Title</FieldLabel>
            <Input id="design-system-title" defaultValue="Strategy notes" />
          </Field>
          <Field>
            <FieldLabel htmlFor="design-system-body">Markdown</FieldLabel>
            <Textarea id="design-system-body" defaultValue="A graph-native presentation." />
          </Field>
        </FieldGroup>
      </CardSection>
      <CardFooter className="justify-end gap-2">
        <Button>Save</Button>
      </CardFooter>
    </Card>

    <Separator />

    <Empty>
      <EmptyHeader>
        <EmptyTitle>No Spaces</EmptyTitle>
        <EmptyDescription>Create a Space to begin authoring Cards and Graphs.</EmptyDescription>
      </EmptyHeader>
      <Spinner aria-label="Loading Spaces" />
    </Empty>
  </div>
);

/** The normal save lifecycle: working feedback, brief acknowledgement, then no chrome. */
export const PersistenceLifecycle: Story = () => {
  const [state, setState] = useState<'pending' | 'settled'>('settled');
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, []);

  const replay = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    setState('pending');
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setState('settled');
    }, 1_000);
  };

  return (
    <div className="flex items-center gap-2">
      <Button onClick={replay}>Replay save</Button>
      <PersistenceIndicator state={state} />
    </div>
  );
};
PersistenceLifecycle.storyName = 'Persistence lifecycle';
