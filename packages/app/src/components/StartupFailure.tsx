import { StatusFailure } from '@project/ui';

/** What `startApplication` (`startup.tsx`) mounts when the app fails to open. */
export function StartupFailure({ message }: { readonly message: string }) {
  return (
    <StatusFailure
      className="min-h-dvh"
      panelClassName="max-w-3xl"
      title="Application could not start"
      description="The space could not be opened."
      detail={message}
      detailLabel="Startup failure detail"
    />
  );
}
