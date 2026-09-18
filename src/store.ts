import { create } from 'zustand';

export type ScreenScale = 'auto' | 'standard' | 'wide' | 'ultra';
export type CommTab = 'messages' | 'recents' | 'contacts' | 'mail';

export const CANVAS_COLORS = ['#F2F4F8','#F7F8FC','#FFFFFF','#FAFAF9','#F5F7F9','#F1F4F7','#ECEFF3','#E7EBEF'];
export const NAV_COLORS = ['#FFFFFF','#F7F8FC','#F2F4F8','#E2E6F0','#C8CCDC','#8C93AB','#5A6078','#1E2235','#181B2A','#334155','#263447','#3B3548'];

export interface UISettings {
  screenScale: ScreenScale;
  fontSize: number;
  defaultCommsTab: CommTab;
  canvasColor: string;
  sidebarColor: string;
  motion: 'normal' | 'reduced';
}

interface AppState extends UISettings {
  setSetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void;
}

const DEFAULTS: UISettings = {
  screenScale: 'auto',
  fontSize: 16.5,
  defaultCommsTab: 'recents',
  canvasColor: '#F2F4F8',
  sidebarColor: '#1E2235',
  motion: 'normal',
};
const SETTINGS_KEY = 'deskphone-ui-settings-v16';
const LEGACY_KEYS = ['forge-crm-ui-settings-v16', 'forge-crm-ui-settings-v15', 'forge-crm-ui-settings-v14'];

function clampFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(14.5, Math.min(20, Math.round(n * 2) / 2)) : DEFAULTS.fontSize;
}
function validColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}
function sanitize(parsed: Partial<UISettings>): UISettings {
  const tab = String(parsed.defaultCommsTab);
  return {
    screenScale: ['auto','standard','wide','ultra'].includes(String(parsed.screenScale)) ? parsed.screenScale as ScreenScale : DEFAULTS.screenScale,
    fontSize: clampFontSize(parsed.fontSize),
    defaultCommsTab: ['messages','recents','contacts','mail'].includes(tab) ? tab as CommTab : DEFAULTS.defaultCommsTab,
    canvasColor: validColor(parsed.canvasColor, DEFAULTS.canvasColor),
    sidebarColor: validColor(parsed.sidebarColor, DEFAULTS.sidebarColor),
    motion: parsed.motion === 'reduced' ? 'reduced' : 'normal',
  };
}
function loadSettings(): UISettings {
  if (typeof localStorage === 'undefined') return DEFAULTS;
  try {
    const direct = localStorage.getItem(SETTINGS_KEY);
    if (direct) return sanitize(JSON.parse(direct));
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return sanitize({
        screenScale: parsed.screenScale as ScreenScale,
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : undefined,
        defaultCommsTab: parsed.defaultCommsTab === 'calls' ? 'recents' : parsed.defaultCommsTab as CommTab,
        canvasColor: (parsed.canvasColor || parsed.bgCanvas) as string,
        sidebarColor: (parsed.sidebarColor || parsed.bgConsole) as string,
        motion: parsed.motion as 'normal' | 'reduced',
      });
    }
  } catch { /* optional preferences must never break the dialer */ }
  return DEFAULTS;
}
function saveSettings(settings: UISettings): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore storage failures */ }
}

const initial = loadSettings();
export const useStore = create<AppState>((set) => ({
  ...initial,
  setSetting: (key, value) => set((state) => {
    const normalized = key === 'fontSize' ? clampFontSize(value) : value;
    const next = { ...state, [key]: normalized } as AppState;
    saveSettings({
      screenScale: next.screenScale,
      fontSize: next.fontSize,
      defaultCommsTab: next.defaultCommsTab,
      canvasColor: next.canvasColor,
      sidebarColor: next.sidebarColor,
      motion: next.motion,
    });
    return { [key]: normalized } as Partial<AppState>;
  }),
}));
