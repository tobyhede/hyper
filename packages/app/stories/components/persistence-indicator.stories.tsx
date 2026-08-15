import { useEffect, useRef, useState } from 'react';
import type { Story } from '@ladle/react';
import { Button, PersistenceIndicator } from '@project/ui';

export default { title: 'Components/Persistence Indicator' };

/** The normal save lifecycle: working feedback, brief acknowledgement, then no chrome. */
export const Lifecycle: Story = () => {
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
