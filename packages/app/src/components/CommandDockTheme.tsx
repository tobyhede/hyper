/**
 * The Command Dock's theme cluster: which theme the page draws, chosen among
 * Light, Dark and System. `CommandDock` mounts {@link ThemeControl} last, when
 * the entry composed a {@link ColorScheme}.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import {
  ChoiceMenu,
  ChoiceMenuTrigger,
  DarkThemeIcon,
  LightThemeIcon,
  SystemThemeIcon,
  ToolbarButton,
  ToolbarGroup,
  type ChoiceMenuChoice,
} from '@project/ui';
import type { ColorScheme, ColorSchemePreference } from '../color-scheme';
import type { MenuSide } from '../dock-placement';
import { DISCLOSURE_ALIGN, DISCLOSURE_SIDE_OFFSET, useDockDisclosure } from './command-dock-shared';

const ICONS = {
  light: <LightThemeIcon />,
  dark: <DarkThemeIcon />,
  system: <SystemThemeIcon />,
} as const satisfies Record<ColorSchemePreference, ReactNode>;

const TITLES = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
} as const satisfies Record<ColorSchemePreference, string>;

const CHOICES: readonly ChoiceMenuChoice<ColorSchemePreference>[] = (
  ['light', 'dark', 'system'] as const
).map((id) => ({ id, title: TITLES[id], icon: ICONS[id] }));

/**
 * `[☀ ⌄]`: the theme's own `ChoiceMenu`, the exclusive list every other set
 * in the Dock is drawn with, its trigger showing what is chosen. It is the
 * Dock's because the Dock is the Space's one command surface (ADR 0082), and
 * its three choices are the set shadcn's own mode toggle offers.
 */
export function ThemeControl({
  colorScheme,
  side = 'bottom',
}: {
  readonly colorScheme: ColorScheme;
  readonly side?: MenuSide;
}) {
  const { id, open, onOpenChange } = useDockDisclosure();
  const preference = useSyncExternalStore(colorScheme.subscribe, colorScheme.getPreference);
  return (
    <ToolbarGroup aria-label="Theme" className="command-dock__cluster">
      <ChoiceMenu<ColorSchemePreference>
        label="Theme"
        choices={CHOICES}
        chosen={preference}
        onChoose={colorScheme.choose}
        open={open}
        onOpenChange={onOpenChange}
        triggerId={id}
        side={side}
        align={DISCLOSURE_ALIGN}
        sideOffset={DISCLOSURE_SIDE_OFFSET}
        className="nokey w-44"
        trigger={
          <ChoiceMenuTrigger
            id={id}
            className="nokey"
            aria-label={`Theme: ${TITLES[preference]}`}
            title="Theme"
            icon={ICONS[preference]}
            render={<ToolbarButton variant="ghost" size="compact" />}
          />
        }
      />
    </ToolbarGroup>
  );
}
