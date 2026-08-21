import type { ReactNode } from 'react';

export function CatalogueSection({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="inv-section">
      <h2 className="inv-section__title inv-mono">{title}</h2>
      {note !== undefined && <p className="inv-section__note">{note}</p>}
      {children}
    </section>
  );
}

export function Specimen({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="inv-specimen">
      <div className="inv-specimen__stage">{children}</div>
      <span className="inv-specimen__label inv-mono">{label}</span>
    </div>
  );
}
