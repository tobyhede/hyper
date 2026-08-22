import { StatusFailure } from '@project/ui';

/** What `SpaceAppFailure` (`SpaceApp.tsx`) draws once it has caught a render throw. */
export function SpaceAppFailureView({ message }: { readonly message: string }) {
  return (
    <StatusFailure
      className="h-full"
      panelClassName="max-w-xl"
      boundedDetail
      title="Unable to open this space"
      detail={message}
      detailLabel="Space app failure detail"
      testId="space-app-failure"
    />
  );
}
