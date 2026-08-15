import type { Story } from '@ladle/react';
import { Alert, AlertDescription, AlertTitle } from '@project/ui';

export default { title: 'Review/Theming' };

export const DarkMode: Story = () => (
  <div className="flex max-w-xl flex-col gap-4">
    <Alert>
      <AlertTitle>Dark mode is not decided</AlertTitle>
      <AlertDescription>
        The handoff carries three candidates—chalk line, borderless plane, and graph frame—and
        explicitly defers implementation until one is chosen. The catalogue therefore keeps the
        locked light Card and canvas treatment.
      </AlertDescription>
    </Alert>
  </div>
);
DarkMode.storyName = 'Dark mode';
