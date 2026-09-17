import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommand, type CommandResult } from '../support/hyper-command';

/**
 * F2 (ledger): a command that spawns a grandchild inheriting stdout/stderr
 * must not hang `runCommand`'s promise past its timeout, and that grandchild
 * must not survive the timeout either.
 *
 * The script backgrounds a sleep well past the timeout, records its pid to a
 * file independent of the stdout/stderr this test never reads, and then
 * `wait`s on it — so the direct child (the shell) also stays alive past the
 * timeout, matching the reviewed hang: killing only the direct process
 * leaves an orphaned grandchild holding the output streams open, and
 * `close` never fires while any process still holds a write end open.
 */
describe('runCommand', () => {
  const TIMEOUT_MS = 300;
  const RACE_GUARD_MS = TIMEOUT_MS + 1_500;
  const GRANDCHILD_SLEEP_SECONDS = 5;

  let workdir: string | undefined;

  afterEach(async () => {
    const dir = workdir;
    workdir = undefined;
    if (dir === undefined) return;
    try {
      const pidText = await readFile(join(dir, 'grandchild.pid'), 'utf8');
      const pid = Number.parseInt(pidText.trim(), 10);
      if (Number.isInteger(pid)) process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, or never written — nothing left to clean up.
    }
    await rm(dir, { recursive: true, force: true });
  });

  type Settled =
    | { readonly kind: 'resolved'; readonly result: CommandResult }
    | { readonly kind: 'rejected'; readonly error: unknown }
    | { readonly kind: 'race-guard-fired' };

  const settleCommand = async (command: string, args: readonly string[]): Promise<Settled> => {
    try {
      const result = await runCommand(command, args, { timeoutMs: TIMEOUT_MS });
      return { kind: 'resolved', result };
    } catch (error) {
      return { kind: 'rejected', error };
    }
  };

  const raceAgainstGuard = async (command: string, args: readonly string[]): Promise<Settled> => {
    const guardFired = new Promise<Settled>((resolve) => {
      setTimeout(() => resolve({ kind: 'race-guard-fired' }), RACE_GUARD_MS);
    });
    return Promise.race([settleCommand(command, args), guardFired]);
  };

  const isProcessAlive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  const GRANDCHILD_EXIT_POLL_MS = 25;
  const GRANDCHILD_EXIT_DEADLINE_MS = 2_000;

  /**
   * `runCommand` settles once it has sent SIGKILL to the whole process group
   * and observed the direct child's own exit — it does not wait on the
   * grandchild's exit specifically (see `runCommand`'s doc comment). Both
   * processes are signalled together, but the OS gives no ordering guarantee
   * between the direct child's exit notification and the grandchild's actual
   * termination, so an immediate `isProcessAlive` check right after the
   * promise settles races that gap. Poll with a bounded deadline instead of
   * asserting immediately.
   */
  const waitForProcessExit = async (pid: number, deadlineMs: number): Promise<boolean> => {
    const deadline = Date.now() + deadlineMs;
    while (isProcessAlive(pid)) {
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, GRANDCHILD_EXIT_POLL_MS));
    }
    return true;
  };

  it('rejects with a timeout error and leaves no grandchild running', async () => {
    workdir = await mkdtemp(join(tmpdir(), 'hyper-command-'));
    const pidFile = join(workdir, 'grandchild.pid');
    const script = `sleep ${GRANDCHILD_SLEEP_SECONDS} & echo $! > '${pidFile}'; wait`;

    const settled = await raceAgainstGuard('sh', ['-c', script]);

    if (settled.kind === 'race-guard-fired') {
      throw new Error(
        `runCommand did not settle within ${RACE_GUARD_MS}ms — a grandchild holding ` +
          'stdout/stderr open is keeping the promise pending past its timeout',
      );
    }
    expect(settled.kind).toBe('rejected');
    if (settled.kind !== 'rejected') return;
    expect(settled.error).toBeInstanceOf(Error);
    if (!(settled.error instanceof Error)) return;
    expect(settled.error.message).toBe(`command timed out after ${TIMEOUT_MS}ms`);

    const pidText = await readFile(pidFile, 'utf8');
    const grandchildPid = Number.parseInt(pidText.trim(), 10);
    expect(Number.isInteger(grandchildPid)).toBe(true);

    const exited = await waitForProcessExit(grandchildPid, GRANDCHILD_EXIT_DEADLINE_MS);
    if (!exited) {
      throw new Error(
        `grandchild pid ${grandchildPid} was still alive ${GRANDCHILD_EXIT_DEADLINE_MS}ms after runCommand settled`,
      );
    }
  });
});
