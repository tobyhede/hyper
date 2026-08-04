export const GraphIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <rect x="2" y="8" width="7" height="6" rx="1.5" />
    <rect x="15" y="2.5" width="7" height="6" rx="1.5" />
    <rect x="15" y="15.5" width="7" height="6" rx="1.5" />
    <path d="M9 10.2 15 6.5M9 12 15 17.8" />
  </svg>
);

export const GridIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);

export const LayoutIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="9" height="6.5" rx="1.5" />
    <rect x="14" y="7" width="7" height="14" rx="1.5" />
    <rect x="3" y="12.5" width="8" height="8.5" rx="1.5" />
  </svg>
);

export const RouteIcon = ({
  color = 'currentColor',
  size = 16,
}: {
  color?: string;
  size?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M3 12h8M11 12l5-6h5M11 12l5 6h5" />
  </svg>
);

export const PresentIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M6 4l14 8-14 8z" />
  </svg>
);

/** A pencil, for the control that renames a Card where its title is drawn. */
export const EditIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 20h4L19.5 8.5a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
    <path d="M14.5 6.5 18 10" />
  </svg>
);

export const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--accent)"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
);
