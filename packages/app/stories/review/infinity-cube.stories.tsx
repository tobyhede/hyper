/**
 * THROWAWAY UX PROTOTYPE — the InfinityCube mark, from the isolated artwork.
 *
 * One ribbon. Hexagonal silhouette, infinity crossing, constant width, 60°
 * turns. It is not a Lucide box, not a Lucide ∞, and not the two-foot path
 * an earlier pass invented.
 *
 * The two-weight block is the live question: same centreline as the raster,
 * hex (cube) heavier than the crossing (∞), so the holes can stay open at 16.
 *
 * **Not built.** Nothing here is exported from `@project/ui`.
 */
import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import {
  CommandName,
  CommandToolbar,
  ParentIcon,
  Separator,
  SpaceIcon,
  SpaceThingIcon,
  ToolbarButton,
} from '@project/ui';
import './infinity-cube.css';

export default { title: 'Review/Infinity Cube' };

const SIZES = [128, 64, 32, 16] as const;
const ICON_SIZES = [32, 16, 14] as const;
const WEIGHT_SIZES = [64, 32, 16, 14] as const;

/** Flat-top hex vertices, r = 8.5 about (12, 12). Stroke 2.25 still fits the box. */
const H = {
  l: [3.5, 12],
  tl: [7.5, 4.64],
  tr: [16.5, 4.64],
  r: [20.5, 12],
  br: [16.5, 19.36],
  bl: [7.5, 19.36],
  c: [12, 12],
} as const;

type Pt = readonly [number, number];

function pt(p: Pt) {
  return `${p[0]} ${p[1]}`;
}

function along(a: Pt, b: Pt, t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const HEX = {
  l: pt(H.l),
  tl: pt(H.tl),
  tr: pt(H.tr),
  r: pt(H.r),
  br: pt(H.br),
  bl: pt(H.bl),
  c: pt(H.c),
} as const;

const RIBBON_PATH = `M${HEX.l} L${HEX.tl} L${HEX.c} L${HEX.tr} L${HEX.r} L${HEX.br} L${HEX.c} L${HEX.bl} Z`;

/** The ribbon segments that form the hex sides, not the crossing. */
const CUBE_PATH = `M${HEX.l} L${HEX.tl} M${HEX.tr} L${HEX.r} L${HEX.br} M${HEX.bl} L${HEX.l}`;

/** Through the centre: the two legs of ∞. */
const INFINITY_PATH = `M${HEX.tl} L${HEX.c} L${HEX.tr} M${HEX.br} L${HEX.c} L${HEX.bl}`;

function Mark({ size }: { readonly size: number }) {
  return <span className="infinity-cube__mark" style={{ width: size, height: size }} />;
}

function SizeRow({
  draw,
  sizes = SIZES,
  caption = false,
}: {
  readonly draw: (size: number) => ReactNode;
  readonly sizes?: readonly number[];
  readonly caption?: boolean;
}) {
  return (
    <span className="infinity-cube__sizes">
      {sizes.map((size) => (
        <span key={size} className="infinity-cube__size">
          {draw(size)}
          {caption ? <span className="infinity-cube__px">{size}</span> : null}
        </span>
      ))}
    </span>
  );
}

function IconSvg({
  size,
  strokeWidth = 2.25,
  fill = 'none',
  children,
}: {
  readonly size: number;
  readonly strokeWidth?: number;
  readonly fill?: string;
  readonly children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The mark as a stroke on the hex lattice. Same centreline, icon weight. */
function Ribbon({ size, strokeWidth }: { readonly size: number; readonly strokeWidth: number }) {
  return (
    <IconSvg size={size} strokeWidth={strokeWidth} fill="none">
      <path d={RIBBON_PATH} strokeMiterlimit={2.4} strokeLinejoin="miter" strokeLinecap="butt" />
    </IconSvg>
  );
}

const CUBE_STROKE = {
  strokeMiterlimit: 2.4,
  strokeLinejoin: 'miter',
  strokeLinecap: 'butt',
} as const;

/**
 * Raster centreline, two weights. The thin ribbon is the whole mark; the heavy
 * stroke is only the hex sides, so the crossing stays the thinner line.
 */
function ReinforcedRibbon({
  size,
  cube,
  inf,
}: {
  readonly size: number;
  readonly cube: number;
  readonly inf: number;
}) {
  return (
    <IconSvg size={size} fill="none">
      <path d={RIBBON_PATH} strokeWidth={inf} strokeLinejoin="miter" strokeLinecap="butt" />
      <path d={CUBE_PATH} strokeWidth={cube} {...CUBE_STROKE} />
    </IconSvg>
  );
}

/** Outer hex sides heavy, crossing only thin — no thin stroke under the cube. */
function SplitRibbon({
  size,
  cube,
  inf,
}: {
  readonly size: number;
  readonly cube: number;
  readonly inf: number;
}) {
  return (
    <IconSvg size={size} fill="none">
      <path d={CUBE_PATH} strokeWidth={cube} {...CUBE_STROKE} />
      <path d={INFINITY_PATH} strokeWidth={inf} strokeLinecap="round" />
    </IconSvg>
  );
}

/** Closed hex at cube weight, crossing at infinity weight. */
function WeightedHexCross({
  size,
  cube,
  inf,
}: {
  readonly size: number;
  readonly cube: number;
  readonly inf: number;
}) {
  return (
    <IconSvg size={size} fill="none">
      <path
        d={`M${HEX.tr} L${HEX.r} L${HEX.br} L${HEX.bl} L${HEX.l} L${HEX.tl} Z`}
        strokeWidth={cube}
        {...CUBE_STROKE}
      />
      <path
        d={`M${HEX.tl} L${HEX.br} M${HEX.tr} L${HEX.bl}`}
        strokeWidth={inf}
        strokeLinecap="round"
      />
    </IconSvg>
  );
}

/** Crossing stops short of the vertices, so it reads as an inner ∞, not an X on the hex. */
function ShortCross({
  size,
  cube,
  inf,
  inset,
}: {
  readonly size: number;
  readonly cube: number;
  readonly inf: number;
  readonly inset: number;
}) {
  const a = along(H.tl, H.br, inset);
  const b = along(H.tl, H.br, 1 - inset);
  const c = along(H.tr, H.bl, inset);
  const d = along(H.tr, H.bl, 1 - inset);
  return (
    <IconSvg size={size} fill="none">
      <path
        d={`M${HEX.tr} L${HEX.r} L${HEX.br} L${HEX.bl} L${HEX.l} L${HEX.tl} Z`}
        strokeWidth={cube}
        {...CUBE_STROKE}
      />
      <path d={`M${pt(a)} L${pt(b)} M${pt(c)} L${pt(d)}`} strokeWidth={inf} strokeLinecap="round" />
    </IconSvg>
  );
}

/** One diagonal yields at the centre, the way the raster ribbon weaves. */
function WovenRibbon({
  size,
  cube,
  inf,
}: {
  readonly size: number;
  readonly cube: number;
  readonly inf: number;
}) {
  const gap = 0.11;
  const underA = along(H.tr, H.bl, 0.5 - gap);
  const underB = along(H.tr, H.bl, 0.5 + gap);
  return (
    <IconSvg size={size} fill="none">
      <path d={CUBE_PATH} strokeWidth={cube} {...CUBE_STROKE} />
      <path d={`M${HEX.tl} L${HEX.br}`} strokeWidth={inf} strokeLinecap="round" />
      <path
        d={`M${HEX.tr} L${pt(underA)} M${pt(underB)} L${HEX.bl}`}
        strokeWidth={inf}
        strokeLinecap="round"
      />
    </IconSvg>
  );
}

/** Hex silhouette plus the two diagonals of ∞. The third diagonal is the cube's Y — leave it off. */
function HexCross({ size }: { readonly size: number }) {
  return (
    <IconSvg size={size}>
      <path d={`M${HEX.tr} L${HEX.r} L${HEX.br} L${HEX.bl} L${HEX.l} L${HEX.tl} Z`} />
      <path d={`M${HEX.tl} L${HEX.br}`} />
      <path d={`M${HEX.tr} L${HEX.bl}`} />
    </IconSvg>
  );
}

/** Smooth lemniscate. Lucide Infinity's path, at the cube's stroke. */
function InfinityMark({ size }: { readonly size: number }) {
  return (
    <IconSvg size={size}>
      <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
    </IconSvg>
  );
}

/**
 * The logo reduced for icon size: its cube silhouette and angular infinity,
 * with no ribbon gaps or weave detail that can close below 16px.
 */
function SmallMark({ size }: { readonly size: number }) {
  return (
    <IconSvg size={size} fill="none">
      <path d="M12 2.75 20 7.35v9.3l-8 4.6-8-4.6v-9.3Z" strokeWidth={2.5} strokeLinejoin="miter" />
      <path
        d="m12 12-3.3-3.3h-2L4.7 12l2 3.3h2l6.6-6.6h2l2 3.3-2 3.3h-2Z"
        strokeWidth={1.5}
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </IconSvg>
  );
}

/**
 * Shipped cube, top face filled. ParentIcon's own note: a cube in isometric has
 * an up-face, and filling it would add the direction the outline dropped.
 */
function CubeLid({ size }: { readonly size: number }) {
  const view = 24;
  const stroke = 2.25;
  const scale = (view - stroke) / 20;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      fill="none"
      aria-hidden="true"
    >
      <g
        transform={`translate(12 12) scale(${scale}) translate(-12 -12)`}
        stroke="currentColor"
        strokeWidth={stroke / scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
        <path d="M3.3 7 12 2.27 20.7 7 12 12Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** Cube outline; the internal Y is swapped for the ∞ crossing. */
function CubeCross({ size }: { readonly size: number }) {
  const view = 24;
  const stroke = 2.25;
  const scale = (view - stroke) / 20;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      fill="none"
      aria-hidden="true"
    >
      <g
        transform={`translate(12 12) scale(${scale}) translate(-12 -12)`}
        stroke="currentColor"
        strokeWidth={stroke / scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="M4.2 6.6 19.8 17.4" />
        <path d="M19.8 6.6 4.2 17.4" />
      </g>
    </svg>
  );
}

/** Two cubes, one inside the other. Says containing; quotes none of the mark. */
function NestedCubes({ size }: { readonly size: number }) {
  return (
    <IconSvg size={size} strokeWidth={2}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
      <path
        d="M16.2 10.1a.9.9 0 0 0-.45-.78l-3.1-1.8a.9.9 0 0 0-.9 0l-3.1 1.8a.9.9 0 0 0-.45.78v3.6a.9.9 0 0 0 .45.78l3.1 1.8a.9.9 0 0 0 .9 0l3.1-1.8a.9.9 0 0 0 .45-.78Z"
        transform="translate(0 -0.4)"
      />
    </IconSvg>
  );
}

function DockCrumb({ mark }: { readonly mark: ReactNode }) {
  return (
    <CommandToolbar className="infinity-cube__dock" aria-label="Parent step specimen">
      <ToolbarButton variant="receded" size="compact">
        {mark}
        <CommandName>Home</CommandName>
      </ToolbarButton>
      <Separator orientation="vertical" align="center" className="mx-1 h-5" />
      <ToolbarButton variant="ghost" size="compact">
        <SpaceThingIcon />
        <CommandName>Nested</CommandName>
      </ToolbarButton>
    </CommandToolbar>
  );
}

const PARENT_MARKS = [
  {
    name: 'shipped cube',
    note: 'What the parent step draws today. Hex + Y. Distinct from the frame beside it; no product mark.',
    draw: (size: number) => <ParentIcon size={size} />,
  },
  {
    name: 'raster mark',
    note: 'The artwork at chrome size. The two holes of the ∞ fill in — this is the blob that was tried and reverted.',
    draw: (size: number) => <Mark size={size} />,
  },
  {
    name: 'ribbon',
    note: 'Same centreline as the artwork, drawn as a stroke. Holes stay open if the weight stays near 2.25.',
    draw: (size: number) => <Ribbon size={size} strokeWidth={2.25} />,
  },
  {
    name: 'ribbon heavy',
    note: 'Logo weight on the same path. Confirms the failure is the band, not the raster.',
    draw: (size: number) => <Ribbon size={size} strokeWidth={5.2} />,
  },
  {
    name: 'hex + cross',
    note: 'Reduction: hex silhouette (the cube) and the two diagonals of ∞. The third diagonal would be a hexagram — it is not drawn.',
    draw: (size: number) => <HexCross size={size} />,
  },
  {
    name: 'infinity',
    note: 'Drop the hex. A lemniscate survives 14px; it no longer says volume, and it is a generic ∞.',
    draw: (size: number) => <InfinityMark size={size} />,
  },
  {
    name: 'cube lid',
    note: 'Decorate the shipped cube: fill the up-face. Still a cube. Adds “above / containing”; quotes none of the ribbon.',
    draw: (size: number) => <CubeLid size={size} />,
  },
  {
    name: 'cube + cross',
    note: 'Decorate the shipped cube: swap the internal Y for the ∞ crossing. Same outline the Dock already taught.',
    draw: (size: number) => <CubeCross size={size} />,
  },
  {
    name: 'nested cubes',
    note: 'Containing, literally. The inner cube dies at 14px the way the mark’s holes do.',
    draw: (size: number) => <NestedCubes size={size} />,
  },
] as const;

const TWO_WEIGHTS = [
  {
    name: 'reinforce 2.8 / 1.35',
    note: 'Thin ribbon is the whole mark; hex sides drawn again heavier. Closest to “the raster, with a thinner ∞”.',
    draw: (size: number) => <ReinforcedRibbon size={size} cube={2.8} inf={1.35} />,
  },
  {
    name: 'reinforce 3.6 / 1.45',
    note: 'Same construction, more cube. The crossing has to stay this thin or the holes close at 14.',
    draw: (size: number) => <ReinforcedRibbon size={size} cube={3.6} inf={1.45} />,
  },
  {
    name: 'reinforce 4.4 / 1.55',
    note: 'Near logo weight on the hex. At 64 this is the mark; at 14 the heavy sides start to crowd.',
    draw: (size: number) => <ReinforcedRibbon size={size} cube={4.4} inf={1.55} />,
  },
  {
    name: 'split 3.2 / 1.4',
    note: 'No thin stroke under the cube — outer sides heavy, crossing only. Junctions at the vertices are the risk.',
    draw: (size: number) => <SplitRibbon size={size} cube={3.2} inf={1.4} />,
  },
  {
    name: 'hex + X 2.75 / 1.25',
    note: 'Closed hex at cube weight, full diagonals thin. The X reaches the corners.',
    draw: (size: number) => <WeightedHexCross size={size} cube={2.75} inf={1.25} />,
  },
  {
    name: 'hex + short ∞ 2.75 / 1.4',
    note: 'Crossing stops short of the vertices. Inner ∞, not an X on the hex.',
    draw: (size: number) => <ShortCross size={size} cube={2.75} inf={1.4} inset={0.28} />,
  },
  {
    name: 'woven 3.2 / 1.4',
    note: 'Split ribbon, one diagonal yields at the centre — the raster’s over/under. The gap is the thing 14px may lose.',
    draw: (size: number) => <WovenRibbon size={size} cube={3.2} inf={1.4} />,
  },
] as const;

export const Default: Story = () => (
  <div className="infinity-cube">
    <p className="infinity-cube__lede">
      The isolated mark. One ribbon. Hexagon and infinity are the same stroke.
    </p>

    <section className="infinity-cube__hero infinity-cube__panel">
      <Mark size={200} />
    </section>

    <h2 className="infinity-cube__heading">Small mark</h2>
    <section className="infinity-cube__panel">
      <div className="infinity-cube__row">
        <SizeRow sizes={[64, 32, 16, 14]} caption draw={(size) => <SmallMark size={size} />} />
        <span className="infinity-cube__body">
          <code className="infinity-cube__name">icon-friendly logo</code>
          <span className="infinity-cube__note">
            One heavy cube, one thin angular infinity. No ribbon gaps or weave detail below 16px.
          </span>
        </span>
      </div>
      <div className="infinity-cube__sand">
        <DockCrumb mark={<SmallMark size={16} />} />
      </div>
    </section>

    <h2 className="infinity-cube__heading">Reduction</h2>
    <section className="infinity-cube__panel">
      <div className="infinity-cube__row">
        <SizeRow draw={(size) => <Mark size={size} />} />
        <span className="infinity-cube__body">
          <code className="infinity-cube__name">primary mark</code>
          <span className="infinity-cube__note">
            128, 64, 32, 16. At 14 the two holes of the ∞ fill in and the mark is a blob — tried on
            the parent step before its toolbar owned a 16px icon box.
          </span>
        </span>
      </div>
    </section>

    <h2 className="infinity-cube__heading">Two weights</h2>
    <p className="infinity-cube__lede">
      The raster is one band. These keep that centreline and give the hex (cube) more stroke than
      the crossing (∞), so the holes can stay open at the Dock&rsquo;s 16px.
    </p>
    <ul className="infinity-cube__list">
      {TWO_WEIGHTS.map((candidate) => (
        <li key={candidate.name} className="infinity-cube__panel">
          <div className="infinity-cube__row">
            <SizeRow sizes={WEIGHT_SIZES} caption draw={candidate.draw} />
            <span className="infinity-cube__body">
              <code className="infinity-cube__name">{candidate.name}</code>
              <span className="infinity-cube__note">{candidate.note}</span>
            </span>
          </div>
          <div className="infinity-cube__sand">
            <DockCrumb mark={candidate.draw(16)} />
          </div>
        </li>
      ))}
    </ul>

    <h2 className="infinity-cube__heading">Parent step at 16</h2>
    <p className="infinity-cube__lede">
      The parent recedes; the Space you are in stays a frame. A candidate has to stay an open mark
      at 16, and stay a different silhouette from that frame.
    </p>
    <ul className="infinity-cube__list">
      {PARENT_MARKS.map((candidate) => (
        <li key={candidate.name} className="infinity-cube__panel">
          <div className="infinity-cube__row">
            <SizeRow sizes={ICON_SIZES} caption draw={candidate.draw} />
            <span className="infinity-cube__body">
              <code className="infinity-cube__name">{candidate.name}</code>
              <span className="infinity-cube__note">{candidate.note}</span>
            </span>
          </div>
          <div className="infinity-cube__sand">
            <DockCrumb mark={candidate.draw(16)} />
          </div>
        </li>
      ))}
    </ul>

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
