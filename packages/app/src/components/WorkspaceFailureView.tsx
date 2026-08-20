import { StatusFailure } from '@project/ui';

/** What `WorkspaceFailure` (`Workspace.tsx`) draws once it has caught a render throw. */
export function WorkspaceFailureView({ message }: { readonly message: string }) {
  return (
    <StatusFailure
      className="h-full"
      panelClassName="max-w-xl"
      boundedDetail
      title="Unable to open this space"
      detail={message}
      detailLabel="Workspace failure detail"
      testId="workspace-failure"
    />
  );
}
