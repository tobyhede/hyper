import { describeAggregateReadRefusal } from '@project/aggregate';
import type { CheckResult, RunRefusal } from '../run/run';
import { shellWord } from './shell-word';

/** Why a run did not start, or a check refused a directory, as the sentence the author reads. */
export const describeRunRefusal = (refusal: RunRefusal, directory: string): string => {
  switch (refusal.kind) {
    case 'empty':
      return `${directory} holds no aggregate: it is missing or empty. To create one there: pnpm cube init ${shellWord(directory)}\n`;
    case 'unreadable':
    case 'aggregate-refused':
      return `${describeAggregateReadRefusal(refusal, directory)}\n`;
  }
};

/** What `cube check` and the MCP `check` tool say about a directory, and whether it was accepted. */
export const describeCheck = (
  result: CheckResult,
  directory: string,
): { readonly accepted: boolean; readonly text: string } =>
  result.kind === 'valid'
    ? { accepted: true, text: `${directory} is a valid aggregate.\n` }
    : { accepted: false, text: describeRunRefusal(result, directory) };
