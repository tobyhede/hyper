/**
 * THROWAWAY UX PROTOTYPE — the InfinityCube mark, from the isolated artwork.
 *
 * One ribbon. Hexagonal silhouette, infinity crossing, constant width, 60°
 * turns. It is not a Lucide box, not a Lucide ∞, and not the two-foot path
 * an earlier pass invented.
 *
 * **Not built.** Nothing here is exported from `@project/ui`.
 */
import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { SpaceIcon } from '@project/ui';
import './infinity-cube.css';

export default { title: 'Review/Infinity Cube' };

const SIZES = [128, 64, 32, 16] as const;

function Mark({ size }: { readonly size: number }) {
  return <span className="infinity-cube__mark" style={{ width: size, height: size }} />;
}

function SizeRow({ draw }: { readonly draw: (size: number) => ReactNode }) {
  return (
    <span className="infinity-cube__sizes">
      {SIZES.map((size) => (
        <span key={size}>{draw(size)}</span>
      ))}
    </span>
  );
}

export const Default: Story = () => (
  <div className="infinity-cube">
    <p className="infinity-cube__lede">
      The isolated mark. One ribbon. Hexagon and infinity are the same stroke.
    </p>

    <section className="infinity-cube__hero infinity-cube__panel">
      <Mark size={200} />
    </section>

    <h2 className="infinity-cube__heading">Reduction</h2>
    <section className="infinity-cube__panel">
      <div className="infinity-cube__row">
        <SizeRow draw={(size) => <Mark size={size} />} />
        <span className="infinity-cube__body">
          <code className="infinity-cube__name">primary mark</code>
          <span className="infinity-cube__note">
            128, 64, 32, 16. At Dock chrome (14) the two holes of the ∞ fill in
            and the mark is a blob — tried on the parent step and reverted.
          </span>
        </span>
      </div>
    </section>

    <h2 className="infinity-cube__heading">Lockup</h2>
    <section className="infinity-cube__panel">
      <div className="infinity-cube__lockup">
        <Mark size={56} />
        <span className="infinity-cube__word" aria-label="InfinityCube">
          INFINITYCUBE<sup className="infinity-cube__cube3">3</sup>
        </span>
      </div>
      <div className="infinity-cube__lockup infinity-cube__lockup--tight">
        <Mark size={28} />
        <span className="infinity-cube__rule" />
        <span className="infinity-cube__word infinity-cube__word--small" aria-label="InfinityCube">
          INFINITYCUBE<sup className="infinity-cube__cube3">3</sup>
        </span>
      </div>
    </section>

    <h2 className="infinity-cube__heading">Beside the shipped Space</h2>
    <section className="infinity-cube__panel">
      <div className="infinity-cube__row">
        <span className="infinity-cube__sizes">
          <Mark size={32} />
          <SpaceIcon size={32} />
          <Mark size={16} />
          <SpaceIcon size={16} />
        </span>
        <span className="infinity-cube__body">
          <code className="infinity-cube__name">mark vs SpaceIcon</code>
          <span className="infinity-cube__note">
            Lucide’s box is still what the product draws for a Space. Many Spaces — and the product
            — would take this ribbon.
          </span>
        </span>
      </div>
    </section>
  </div>
);
