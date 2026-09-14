// THROWAWAY: put only the Space dock above the embedded React Flow siblings.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function FloatingSpaceRail({
  children,
  inset,
  show,
}: {
  readonly children: ReactNode;
  readonly inset: number;
  readonly show: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setRoot(anchor.current?.closest('.floating-dock-prototype') ?? null);
  }, []);
  useLayoutEffect(() => {
    const card = anchor.current?.closest<HTMLElement>('.canvas-thing');
    const panel = floating.current;
    if (!card || !panel) return;
    let frame = 0;
    const position = () => {
      const rect = card.getBoundingClientRect();
      const zoom = rect.width / card.offsetWidth;
      panel.style.left = `${rect.left + inset * zoom}px`;
      panel.style.top = `${rect.top + inset * zoom}px`;
      panel.style.width = `${card.offsetWidth - inset * 2}px`;
      panel.style.transform = `scale(${zoom})`;
      panel.dataset.visible = String(
        show ||
          card.matches(
            ':hover, :focus-within, [data-state=selected], [data-state=dragging], [data-content-editing=true]',
          ) ||
          panel.matches(':hover, :focus-within'),
      );
      frame = requestAnimationFrame(position);
    };
    position();
    return () => cancelAnimationFrame(frame);
  }, [root, inset, show]);
  return (
    <>
      <span ref={anchor} hidden />
      {root &&
        createPortal(
          <div ref={floating} className="floating-dock-prototype__space-rail">
            {children}
          </div>,
          root,
        )}
    </>
  );
}
