import type { Story } from '@ladle/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
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

    <Card>
      <CardHeader>
        <CardTitle>Space settings</CardTitle>
        <CardDescription>Shared Card composition for a bounded product surface.</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
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
