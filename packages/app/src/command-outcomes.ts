import type { MapId } from '@project/core';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObservableState,
  type ObserverErrorReporter,
} from '@project/persistence';
import {
  describeAuthoringRefusal,
  describeSpaceResourceCreationBreak,
  describeSpaceResourceRefusal,
} from './authoring-refusal';
import type { Continuation, PendingContinuation } from './continuation';
import { failureMessage } from './failure-message';
import type { EditOutcome } from './authoring-commands';
import type { CompletedGraphEdit } from './graph-authoring-commands';
import type { CompletedMapEdit } from './map-authoring-commands';
import type { Navigation } from './navigation';
import type { ExitSpaceResult, OpenSpace, SelectSpaceResult } from './open-spaces';
import type { AuthoringResult, SpaceAuthoring } from './space-authoring';
import type {
  SpaceResourceCreationResult,
  SpaceResourceDeletionResult,
} from './space-resource-lifecycle';

/**
 * What the author is told after a chrome command, as one module.
 *
 * A command runs an Edit or a lifecycle operation, and what it leaves behind is
 * a **notice** on one channel: which words, whether a Map change clears them,
 * and where the caret goes after a creation. `run` narrows a command's result,
 * describes it and publishes it, and reports a throw, so a caller names its
 * command and its operation and nothing else; `App` draws what this module
 * publishes.
 *
 * **Channels and commands are two tables.** A channel is one notice slot — the
 * thing drawn and dismissed. A command is one operation that reports on a
 * channel, and it declares the result union its operation answers and the words
 * that result is said in. Several commands share a channel where the author is
 * told the same thing: Space Resource and ordinary Resource deletion are two
 * operations with two refusal vocabularies and one "Resource not deleted", and
 * Enter, Exit and Open are three operations on "Space command failed", each
 * naming its own `subject`.
 *
 * **Reported channels carry a complete report instead of words.** Map and
 * Graph authoring own the title and message of an Edit's report beside the
 * decision that produced it; a reported command's refused result carries that
 * {@link CommandNotice} whole, and this module owns only its lifetime —
 * staleness, dismissal and the Map-change reset.
 *
 * **A throw is never dressed as a refusal** (`CONTEXT.md`, Completion outcome).
 * It reaches the reporter and publishes the command's break sentence, and
 * `run` answers {@link COMMAND_BROKE} in place of a result.
 *
 * **Discarded work answers nothing a caller can act on.** A settlement that is
 * no longer current answers {@link COMMAND_DISCARDED} in place of the whole
 * result, so a caller that narrows on `completed` cannot follow work its
 * epoch has moved past (`CONTEXT.md`, Replacement epoch).
 */

/** One standing notice: the title the shell draws it under, and its sentence. */
export interface CommandNotice {
  readonly title: string;
  readonly message: string;
}

interface ChannelLifetime {
  readonly resetsOnMapChange: boolean;
}

/**
 * Where a channel's words come from.
 *
 * `described` channels own a fixed title and their commands describe a result
 * in a sentence; `reported` channels take the whole notice from the command's
 * result.
 */
type ChannelEntry =
  | (ChannelLifetime & { readonly words: 'described'; readonly title: string })
  | (ChannelLifetime & { readonly words: 'reported' });

/**
 * One entry per shell notice.
 *
 * `resetsOnMapChange` makes a notice live only as long as the Map it was
 * pressed on: a Map change clears it where it stands, and a run pressed on one
 * Map settles under that Map or not at all — except a completion whose run
 * claimed it moves that Map ({@link MapCompletionClaim}).
 */
const CHANNELS = {
  'map-create': { resetsOnMapChange: true, words: 'reported' },
  'map-manage': { resetsOnMapChange: true, words: 'reported' },
  'map-delete': { resetsOnMapChange: true, words: 'reported' },
  'graph-create': { resetsOnMapChange: true, words: 'reported' },
  'graph-edit': { resetsOnMapChange: true, words: 'reported' },
  'graph-delete': { resetsOnMapChange: true, words: 'reported' },
  'resource-delete': {
    resetsOnMapChange: true,
    words: 'described',
    title: 'Resource not deleted',
  },
  'resource-remove': {
    resetsOnMapChange: true,
    words: 'described',
    title: 'Resource not removed',
  },
  // It names what died. A Space Resource's placement is optimistic (ADR
  // 0089), so the author may be typing into the Resource when the lifecycle
  // answers, and this title makes a Resource vanishing from under the caret
  // legible.
  'space-resource-create': {
    resetsOnMapChange: false,
    words: 'described',
    title: 'Space not created',
  },
  'reference-create': {
    resetsOnMapChange: false,
    words: 'described',
    title: 'Reference Resource not created',
  },
  // Enter, Exit and Open reach *another* Space's session, and each can fail
  // for a reason that is not a refusal — a Space that cannot be re-composed, a
  // backend that will not answer. This notice is what tells the author the
  // press did nothing, and the reporter still hears the defect.
  'space-command': {
    resetsOnMapChange: false,
    words: 'described',
    title: 'Space command failed',
  },
} as const satisfies Record<string, ChannelEntry>;

export type CommandChannel = keyof typeof CHANNELS;

type DescribedChannel = {
  [Channel in CommandChannel]: (typeof CHANNELS)[Channel] extends { readonly words: 'described' }
    ? Channel
    : never;
}[CommandChannel];

type ReportedChannel = Exclude<CommandChannel, DescribedChannel>;

/** Every channel, in the order the shell draws their notices. */
export const COMMAND_CHANNELS = [
  'resource-delete',
  'resource-remove',
  'map-create',
  'map-manage',
  'map-delete',
  'space-resource-create',
  'reference-create',
  'space-command',
  'graph-create',
  'graph-edit',
  'graph-delete',
] as const satisfies readonly CommandChannel[];

/** The words a described channel says a sentence under. */
const described =
  (channel: DescribedChannel) =>
  (message: string): CommandNotice => ({ title: CHANNELS[channel].title, message });

/** The one runtime value a channel's sentences may name. */
export interface CommandSubject {
  /** The title of the Space or entity the press was about. */
  readonly subject: string;
}

/**
 * Where the author continues after a completed result.
 *
 * A function of the result because the continuation names what the operation
 * minted — the id the lifecycle made, not the Resource that appeared. It
 * answers `null` where the completion names nothing to continue at: Space
 * Authoring's completed result carries `createdResourceId` optionally.
 */
export interface CommandContinuation<Completed> {
  readonly continueAt?: (completed: Completed) => PendingContinuation | null;
}

type Completed<Result> = Extract<Result, { readonly kind: 'completed' }>;

/**
 * Where the author continues after a completed Map creation.
 *
 * Required, and never `null`: a created Map always has a name to continue in,
 * so a `completed` answer from `run` means the continuation was requested.
 */
export interface MapCreateContinuation {
  readonly continueAt: (created: CompletedMapEdit) => PendingContinuation;
}

/**
 * Whether this run's completion is what moves the Map these command outcomes
 * read.
 *
 * Required on every Map creation and deletion, because only the caller knows:
 * the Dock's creation selects the new Map on the canvas it stands on, and its
 * deletion leaves that canvas on the survivor, so both claim it. A Space
 * Resource's rail authors in the target Space and is held by the containing
 * canvas's command outcomes, whose Map it never moves, so it claims neither.
 * A claimed completion is not held to the Map the run was pressed on; every
 * other outcome, and every unclaimed completion, still is.
 */
export interface MapCompletionClaim {
  readonly completionMovesMap: boolean;
}

/**
 * What each command's operation answers, and what `run` must be given with it.
 *
 * `options` is a tuple so a command whose sentences name a `subject` makes the
 * argument required and every other command leaves it out.
 */
interface CommandSignatures {
  readonly 'map-create': {
    readonly result: EditOutcome<CompletedMapEdit>;
    readonly options: [options: MapCreateContinuation & MapCompletionClaim];
  };
  readonly 'map-manage': { readonly result: EditOutcome; readonly options: [] };
  readonly 'map-delete': {
    readonly result: EditOutcome;
    readonly options: [options: MapCompletionClaim];
  };
  readonly 'graph-create': {
    readonly result: EditOutcome<CompletedGraphEdit>;
    readonly options: [];
  };
  readonly 'graph-edit': { readonly result: EditOutcome; readonly options: [] };
  readonly 'graph-delete': {
    readonly result: EditOutcome<CompletedGraphEdit>;
    readonly options: [];
  };
  readonly 'resource-delete': { readonly result: AuthoringResult; readonly options: [] };
  readonly 'space-resource-delete': {
    readonly result: SpaceResourceDeletionResult;
    readonly options: [];
  };
  readonly 'resource-remove': { readonly result: AuthoringResult; readonly options: [] };
  readonly 'space-resource-create': {
    readonly result: SpaceResourceCreationResult;
    readonly options: [options?: CommandContinuation<Completed<SpaceResourceCreationResult>>];
  };
  readonly 'reference-create': {
    readonly result: AuthoringResult;
    readonly options: [options?: CommandContinuation<Completed<AuthoringResult>>];
  };
  readonly 'space-enter': {
    readonly result: OpenSpace;
    readonly options: [options: CommandSubject];
  };
  readonly 'space-exit': {
    readonly result: ExitSpaceResult;
    readonly options: [options: CommandSubject];
  };
  readonly 'space-open': {
    readonly result: SelectSpaceResult;
    readonly options: [options: CommandSubject];
  };
}

export type CommandName = keyof CommandSignatures;
export type CommandResult<Command extends CommandName> = CommandSignatures[Command]['result'];
export type CommandOptions<Command extends CommandName> = CommandSignatures[Command]['options'];

/** What a settled result leaves on its channel. */
type Settlement =
  | { readonly kind: 'notice'; readonly notice: CommandNotice }
  | { readonly kind: 'clear'; readonly continuation: PendingContinuation | null };

/**
 * A thrown operation's sentence.
 *
 * The failure is `unknown` because a `throw` can carry anything — the
 * caught-error boundary, named on the type the way `FailureMessage` names it.
 */
type CommandBreak<Options extends readonly unknown[]> = (
  failure: unknown,
  ...options: Options
) => CommandNotice;

interface CommandDefinition<Result, Options extends readonly unknown[]> {
  readonly channel: CommandChannel;
  readonly settle: (result: Result, ...options: Options) => Settlement;
  /**
   * The break sentence, or `null` where the command's words are reported.
   *
   * A Map command reports its own coordination failures as complete reports,
   * so a throw reaching here is a defect with no sentence this module owns: it
   * reaches the reporter and leaves the channel clear.
   */
  readonly broke: CommandBreak<Options> | null;
  /**
   * Whether this result is a completion its run claimed moves the Map, which
   * exempts it from the Map check — the one case staleness reads a result.
   */
  readonly movedMap?: (result: Result, ...options: Options) => boolean;
}

type CommandDefinitions = {
  readonly [Command in CommandName]: CommandDefinition<
    CommandResult<Command>,
    CommandOptions<Command>
  >;
};

const CLEAR: Settlement = { kind: 'clear', continuation: null };

const notice = (value: CommandNotice): Settlement => ({ kind: 'notice', notice: value });

const claimedMove = (result: EditOutcome, { completionMovesMap }: MapCompletionClaim): boolean =>
  completionMovesMap && result.kind === 'completed';

const reportedCommand = (channel: ReportedChannel): CommandDefinition<EditOutcome, []> => ({
  channel,
  settle: (result) => (result.kind === 'refused' ? notice(result.report) : CLEAR),
  broke: null,
});

const authoringCommand = (channel: DescribedChannel): CommandDefinition<AuthoringResult, []> => ({
  channel,
  settle: (result) =>
    result.kind === 'refused'
      ? notice(described(channel)(describeAuthoringRefusal(result.refusal)))
      : CLEAR,
  broke: (failure) => described(channel)(failureMessage(failure)),
});

const COMMANDS: CommandDefinitions = {
  'map-create': {
    channel: 'map-create',
    settle: (result, { continueAt }) => {
      if (result.kind === 'refused') return notice(result.report);
      if (result.kind !== 'completed') return CLEAR;
      return { kind: 'clear', continuation: continueAt(result) };
    },
    broke: null,
    movedMap: claimedMove,
  },
  'map-manage': reportedCommand('map-manage'),
  'map-delete': {
    channel: 'map-delete',
    settle: (result) => (result.kind === 'refused' ? notice(result.report) : CLEAR),
    broke: null,
    movedMap: claimedMove,
  },
  // A creation's completion activates the new Graph in the Map it was pressed
  // on, and never moves the Map, so it needs no claim; where the caret goes
  // after it is the surface's, which neither the Dock nor the rail spends.
  'graph-create': reportedCommand('graph-create'),
  'graph-edit': reportedCommand('graph-edit'),
  // A deletion leaves the canvas on a surviving Graph of the same Map, so it
  // never moves the Map either.
  'graph-delete': reportedCommand('graph-delete'),
  'resource-delete': authoringCommand('resource-delete'),
  'space-resource-delete': {
    channel: 'resource-delete',
    settle: (result) =>
      result.kind === 'refused'
        ? notice(described('resource-delete')(describeSpaceResourceRefusal(result.refusal)))
        : CLEAR,
    broke: (failure) => described('resource-delete')(failureMessage(failure)),
  },
  'resource-remove': authoringCommand('resource-remove'),
  'space-resource-create': {
    channel: 'space-resource-create',
    settle: (result, options) => {
      if (result.kind === 'refused') {
        return notice(
          described('space-resource-create')(describeSpaceResourceRefusal(result.refusal)),
        );
      }
      // `unchanged` made no Resource, so there is nothing to continue at.
      if (result.kind === 'unchanged') return CLEAR;
      return { kind: 'clear', continuation: options?.continueAt?.(result) ?? null };
    },
    broke: (failure) =>
      described('space-resource-create')(describeSpaceResourceCreationBreak(failure)),
  },
  'reference-create': {
    channel: 'reference-create',
    settle: (result, options) => {
      if (result.kind === 'refused') {
        return notice(described('reference-create')(describeAuthoringRefusal(result.refusal)));
      }
      if (result.kind !== 'completed') return CLEAR;
      return { kind: 'clear', continuation: options?.continueAt?.(result) ?? null };
    },
    broke: (failure) => described('reference-create')(failureMessage(failure)),
  },
  'space-enter': {
    channel: 'space-command',
    settle: () => CLEAR,
    broke: (_failure, { subject }) =>
      described('space-command')(`${subject} could not be entered.`),
  },
  'space-exit': {
    channel: 'space-command',
    // An exit's refusal and warning are the Dock's exit report, not a notice.
    settle: () => CLEAR,
    broke: (_failure, { subject }) => described('space-command')(`${subject} could not be exited.`),
  },
  'space-open': {
    channel: 'space-command',
    settle: (result, { subject }) =>
      result.kind === 'refused'
        ? notice(described('space-command')(`${subject} could not be opened.`))
        : CLEAR,
    broke: (_failure, { subject }) => described('space-command')(`${subject} could not be opened.`),
  },
};

/** What `run` answers in place of a result when the operation threw. */
export const COMMAND_BROKE = { kind: 'broke' } as const;
export type CommandBroke = typeof COMMAND_BROKE;

/**
 * What `run` answers in place of a result when the settlement is stale.
 *
 * It replaces the whole result — never a `completed`, `unchanged` or
 * `refused` — so a caller cannot act on work its run epoch, its Map or its
 * Space has moved past. It is not a refusal: there is nothing to say.
 */
export const COMMAND_DISCARDED = { kind: 'discarded' } as const;
export type CommandDiscarded = typeof COMMAND_DISCARDED;

export interface CommandOutcomesState {
  /** The standing notice on each channel that has one. */
  readonly notices: ReadonlyMap<CommandChannel, CommandNotice>;
}

/**
 * Run one command and deliver its outcome to its channel.
 *
 * Synchronous in, synchronous out; a promise in, a promise out. An operation
 * that throws before it returns answers {@link COMMAND_BROKE} synchronously
 * whichever it was, so an asynchronous operation is written as one whose
 * throws are rejections. A stale settlement answers {@link COMMAND_DISCARDED}
 * whether it returned or threw.
 */
export interface CommandRun {
  <Command extends CommandName, Result extends CommandResult<Command>>(
    command: Command,
    operation: () => Result,
    ...options: CommandOptions<Command>
  ): Result | CommandBroke | CommandDiscarded;
  <Command extends CommandName, Result extends CommandResult<Command>>(
    command: Command,
    operation: () => Promise<Result>,
    ...options: CommandOptions<Command>
  ): Promise<Result | CommandBroke | CommandDiscarded>;
}

export interface CommandOutcomes {
  readonly getState: () => CommandOutcomesState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Run `operation` for `command`, publish what it leaves on the command's
   * channel, and answer its result — {@link COMMAND_BROKE} if it threw, or
   * {@link COMMAND_DISCARDED} if it settled stale.
   *
   * The channel is cleared at the press. A refusal publishes the command's
   * words; a completion requests `continueAt`'s continuation where one is
   * given; anything else leaves the channel clear. A settlement publishes only
   * while it is still current — see {@link createCommandOutcomes}.
   */
  readonly run: CommandRun;
  /** Put away one channel's standing notice. */
  readonly dismiss: (channel: CommandChannel) => void;
  readonly dispose: () => void;
}

export interface CommandOutcomesDependencies {
  /** Where the replacement epoch is read. */
  readonly authoring: SpaceAuthoring;
  readonly navigation: Navigation;
  /** Where a completed creation continues. */
  readonly continuation: Continuation;
  /** Where a thrown operation is reported, and where an observer failure goes. */
  readonly reportObserverError: ObserverErrorReporter;
}

/** What a run captured at its press, and must still hold when it settles. */
interface Press {
  readonly channel: CommandChannel;
  readonly epoch: number;
  /** The Map selected at the press, for a channel a Map change resets. */
  readonly mapId: MapId | null;
  readonly replacementEpoch: number;
}

const NONE: CommandOutcomesState = { notices: new Map() };

/**
 * One Space's command outcomes.
 *
 * **Staleness is this module's, not the caller's.** A settlement publishes only
 * while three things captured at its press still hold: the channel's run epoch,
 * so two runs on one channel cannot land out of order; the selected Map, for a
 * channel a Map change resets, so an outcome pressed on one Map is never drawn
 * under another — except a completion that is itself what moved the Map; and
 * Space Authoring's replacement epoch, so an outcome about a replaced Space is
 * never drawn over its replacement (`CONTEXT.md`, Replacement epoch). A stale
 * settlement is discarded in silence and `run` answers
 * {@link COMMAND_DISCARDED} — it is not an outcome the author asked for — but
 * one that threw still reaches the reporter: the defect happened whether or
 * not anyone is left to be told.
 */
export function createCommandOutcomes({
  authoring,
  navigation,
  continuation,
  reportObserverError,
}: CommandOutcomesDependencies): CommandOutcomes {
  const observable: ObservableState<CommandOutcomesState> = createObservableState(
    NONE,
    reportObserverError,
  );
  const reportBreak = createNonThrowingReporter(reportObserverError);
  const epochs = new Map<CommandChannel, number>();
  let disposed = false;

  const write = (channel: CommandChannel, value: CommandNotice | null): void => {
    const { notices } = observable.getState();
    if (value === null && !notices.has(channel)) return;
    const next = new Map(notices);
    if (value === null) next.delete(channel);
    else next.set(channel, value);
    observable.publish({ notices: next });
  };

  let selectedMapId = navigation.getState().selectedMapId;
  const unsubscribeNavigation = navigation.subscribe(() => {
    const next = navigation.getState().selectedMapId;
    if (next === selectedMapId) return;
    selectedMapId = next;
    const { notices } = observable.getState();
    const kept = new Map([...notices].filter(([channel]) => !CHANNELS[channel].resetsOnMapChange));
    if (kept.size !== notices.size) observable.publish({ notices: kept });
  });

  // A replacement clears every standing notice: each was about the Space that
  // was replaced. A run still in flight is dropped by `current` instead.
  let replacementEpoch = authoring.getState().replacementEpoch;
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const next = authoring.getState().replacementEpoch;
    if (next === replacementEpoch) return;
    replacementEpoch = next;
    if (observable.getState().notices.size > 0) observable.publish(NONE);
  });

  const press = (channel: CommandChannel): Press => {
    const epoch = (epochs.get(channel) ?? 0) + 1;
    epochs.set(channel, epoch);
    write(channel, null);
    return {
      channel,
      epoch,
      mapId: CHANNELS[channel].resetsOnMapChange ? navigation.getState().selectedMapId : null,
      replacementEpoch: authoring.getState().replacementEpoch,
    };
  };

  /**
   * Whether a settlement pressed at `at` may still publish. `movedMap` is
   * whether it is a completion its run claimed moved the Map, which the Map
   * check exempts.
   */
  const current = (
    { channel, epoch, mapId, replacementEpoch }: Press,
    movedMap: boolean,
  ): boolean =>
    !disposed &&
    epochs.get(channel) === epoch &&
    authoring.getState().replacementEpoch === replacementEpoch &&
    (mapId === null || movedMap || navigation.getState().selectedMapId === mapId);

  const settle = <Result, Options extends readonly unknown[]>(
    at: Press,
    definition: CommandDefinition<Result, Options>,
    result: Result,
    options: Options,
  ): Result | CommandDiscarded => {
    if (!current(at, definition.movedMap?.(result, ...options) ?? false)) return COMMAND_DISCARDED;
    const settlement = definition.settle(result, ...options);
    if (settlement.kind === 'notice') {
      write(at.channel, settlement.notice);
      return result;
    }
    write(at.channel, null);
    if (settlement.continuation !== null) continuation.request(settlement.continuation);
    return result;
  };

  const broke = <Result, Options extends readonly unknown[]>(
    at: Press,
    definition: CommandDefinition<Result, Options>,
    failure: unknown,
    options: Options,
  ): CommandBroke | CommandDiscarded => {
    reportBreak(failure);
    if (!current(at, false)) return COMMAND_DISCARDED;
    write(at.channel, definition.broke?.(failure, ...options) ?? null);
    return COMMAND_BROKE;
  };

  function run<Command extends CommandName, Result extends CommandResult<Command>>(
    command: Command,
    operation: () => Result,
    ...options: CommandOptions<Command>
  ): Result | CommandBroke | CommandDiscarded;
  function run<Command extends CommandName, Result extends CommandResult<Command>>(
    command: Command,
    operation: () => Promise<Result>,
    ...options: CommandOptions<Command>
  ): Promise<Result | CommandBroke | CommandDiscarded>;
  function run<Command extends CommandName, Result extends CommandResult<Command>>(
    command: Command,
    operation: () => Result | Promise<Result>,
    ...options: CommandOptions<Command>
  ): Result | CommandBroke | CommandDiscarded | Promise<Result | CommandBroke | CommandDiscarded> {
    const definition: CommandDefinition<CommandResult<Command>, CommandOptions<Command>> = COMMANDS[
      command
    ];
    const at = press(definition.channel);
    let returned: Result | Promise<Result>;
    try {
      returned = operation();
    } catch (failure) {
      return broke(at, definition, failure, options);
    }
    if (returned instanceof Promise) {
      return returned.then(
        (result: Result) => settle(at, definition, result, options),
        (failure: unknown) => broke(at, definition, failure, options),
      );
    }
    return settle(at, definition, returned, options);
  }

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    run,
    dismiss: (channel) => write(channel, null),
    dispose: () => {
      disposed = true;
      unsubscribeNavigation();
      unsubscribeAuthoring();
      observable.clearSubscribers();
    },
  };
}
