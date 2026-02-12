import type { Graphics } from "pixi.js";

export interface ThemeColors {
  brass: number;
  copper: number;
  amber: number;
  gold: number;
  darkBg: number;
  panelBg: number;
  rivet: number;
  mutedText: number;
  success: number;
  danger: number;
  ping: number;
  text: number;
  textBright: number;
  textSoft: number;
  warningBright: number;
  warningMid: number;
  warningLow: number;
  critical: number;
  uiMuted: number;
}

export interface ThemeFonts {
  ui: string;
  mono: string;
}

export interface Theme {
  colors: ThemeColors;
  fonts: ThemeFonts;
  drawPanel: (gfx: Graphics, x: number, y: number, w: number, h: number, rivets?: boolean) => void;
}

const DEFAULT_COLORS: ThemeColors = {
  brass: 0xb8860b,
  copper: 0xcd7f32,
  amber: 0xdaa520,
  gold: 0xffd700,
  darkBg: 0x120e08,
  panelBg: 0x1a1208,
  rivet: 0xd4a844,
  mutedText: 0xc4b89a,
  success: 0x6aad5a,
  danger: 0xcc4433,
  ping: 0x7ee3c2,
  text: 0xe6e6e6,
  textBright: 0xffffff,
  textSoft: 0xd0d7de,
  warningBright: 0xff4444,
  warningMid: 0xffaa44,
  warningLow: 0xff8866,
  critical: 0xff4444,
  uiMuted: 0x888888,
};

const DEFAULT_FONTS: ThemeFonts = {
  ui: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"SF Mono", "Cascadia Mono", "Consolas", monospace',
};

function drawBrassPanel(gfx: Graphics, x: number, y: number, w: number, h: number, rivets = true, colors = DEFAULT_COLORS) {
  gfx.roundRect(x, y, w, h, 3);
  gfx.fill({ color: colors.darkBg, alpha: 0.92 });
  gfx.roundRect(x, y, w, h, 3);
  gfx.stroke({ color: colors.brass, width: 2 });
  if (rivets) {
    const r = 2.5;
    for (const [rx, ry] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
      gfx.circle(rx, ry, r);
      gfx.fill({ color: colors.rivet });
      gfx.circle(rx, ry, r);
      gfx.stroke({ color: colors.brass, width: 0.5, alpha: 0.6 });
    }
  }
}

export const DEFAULT_THEME: Theme = {
  colors: DEFAULT_COLORS,
  fonts: DEFAULT_FONTS,
  drawPanel: (gfx, x, y, w, h, rivets = true) => drawBrassPanel(gfx, x, y, w, h, rivets, DEFAULT_COLORS),
};
