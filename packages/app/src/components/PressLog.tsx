import { useEffect, useState } from 'react';
import { Button } from '@project/ui';
import { copyLink } from '../clipboard';
import {
  describeTarget,
  isModifierOnly,
  onPressReport,
  pressLabel,
  pressLogText,
  pressVerdict,
  ran,
  type PressEntry,
} from '../press-log';
import type { DispatchReport } from '../key-dispatcher';

const SHOWN = 12;

/**
 * The press log overlay. It reads each press on the window before anything
 * else can stop it, collects every dispatcher's report of the same press, and
 * shows the press once its dispatch has finished.
 */
export function PressLog() {
  const [entries, setEntries] = useState<readonly PressEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let sequence = 0;
    const pending = new Map<
      KeyboardEvent,
      { press: string; landedOn: string; reports: DispatchReport[] }
    >();
    const pendingFor = (event: KeyboardEvent) => {
      const known = pending.get(event);
      if (known !== undefined) return known;
      const entry = {
        press: pressLabel(event),
        landedOn: describeTarget(event.target),
        reports: [],
      };
      pending.set(event, entry);
      // Dispatch is synchronous, so every report of this press is in by the
      // time the next task runs.
      setTimeout(() => {
        pending.delete(event);
        sequence += 1;
        const settled: PressEntry = { sequence, ...entry, prevented: event.defaultPrevented };
        setEntries((shown) => [settled, ...shown].slice(0, SHOWN));
      });
      return entry;
    };
    const read = (event: KeyboardEvent) => {
      if (!isModifierOnly(event)) pendingFor(event);
    };
    window.addEventListener('keydown', read, true);
    const stopHearing = onPressReport((event, report) => {
      if (!isModifierOnly(event)) pendingFor(event).reports.push(report);
    });
    return () => {
      window.removeEventListener('keydown', read, true);
      stopHearing();
    };
  }, []);

  const copy = async () => {
    const refusal = await copyLink(pressLogText(entries));
    setCopied(refusal ?? 'Copied');
  };

  return (
    <section
      aria-label="Press log"
      className="nokey pointer-events-none fixed top-2 left-2 z-[1000] w-[30rem] max-w-[calc(100vw-1rem)] rounded-md bg-black/85 p-2 font-mono text-[11px] leading-snug text-white shadow-lg"
    >
      <header className="pointer-events-auto mb-1 flex items-center gap-2">
        <span className="font-semibold">Press log</span>
        <span className="flex-1 text-white/60">{copied}</span>
        <Button size="compact" onClick={() => void copy()}>
          Copy
        </Button>
        <Button size="compact" onClick={() => setEntries([])}>
          Clear
        </Button>
      </header>
      {entries.length === 0 ? (
        <p className="text-white/60">Press a key.</p>
      ) : (
        <ol>
          {entries.map((entry) => (
            <li key={entry.sequence} className="border-t border-white/10 py-0.5">
              <span className={ran(entry) ? 'text-emerald-300' : 'text-amber-300'}>
                {entry.press}
              </span>
              <span className="text-white/60"> on {entry.landedOn}</span>
              <div>{pressVerdict(entry)}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
