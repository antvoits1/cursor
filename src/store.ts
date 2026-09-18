import { create } from 'zustand';
import { INITIAL_LEADS, type Lead } from './data';

export type NavMode = 'sidebar-slim' | 'sidebar-wide' | 'topbar';
export type ScreenScale = 'auto' | 'standard' | 'wide' | 'ultra';
export type CommTab = 'messages' | 'calls' | 'contacts' | 'dialer' | 'email';

export const CANVAS_COLORS = ['#F2F4F8','#F7F8FC','#FFFFFF','#FAFAF9','#F5F7F9','#F1F4F7','#ECEFF3','#E7EBEF'];
export const NAV_COLORS = ['#FFFFFF','#F7F8FC','#F2F4F8','#E2E6F0','#C8CCDC','#8C93AB','#5A6078','#1E2235','#181B2A','#334155','#263447','#3B3548'];

export interface UISettings {
  screenScale: ScreenScale;
  fontSize: number;
  navMode: NavMode;
  leadDensity: 'standard' | 'compact';
  motion: 'normal' | 'reduced';
  defaultCommsTab: CommTab;
  canvasColor: string;
  sidebarColor: string;
}

interface AppState extends UISettings {
  leads: Lead[];
  setSetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void;
  setNavMode: (mode: NavMode) => void;
}

const DEFAULTS: UISettings = {
  screenScale: 'auto',
  fontSize: 16.5,
  navMode: 'topbar',
  leadDensity: 'standard',
  motion: 'normal',
  defaultCommsTab: 'dialer',
  canvasColor: '#F2F4F8',
  sidebarColor: '#1E2235',
};
const SETTINGS_KEY = 'forge-crm-ui-settings-v16';
const LEGACY_KEYS = ['forge-crm-ui-settings-v15', 'forge-crm-ui-settings-v14'];

function clampFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(14.5, Math.min(20, Math.round(n * 2) / 2)) : DEFAULTS.fontSize;
}
function validColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}
function sanitize(parsed: Partial<UISettings>): UISettings {
  return {
    screenScale: ['auto','standard','wide','ultra'].includes(String(parsed.screenScale)) ? parsed.screenScale as ScreenScale : DEFAULTS.screenScale,
    fontSize: clampFontSize(parsed.fontSize),
    navMode: ['topbar','sidebar-slim','sidebar-wide'].includes(String(parsed.navMode)) ? parsed.navMode as NavMode : DEFAULTS.navMode,
    leadDensity: parsed.leadDensity === 'compact' ? 'compact' : 'standard',
    motion: parsed.motion === 'reduced' ? 'reduced' : 'normal',
    defaultCommsTab: ['messages','calls','contacts','dialer','email'].includes(String(parsed.defaultCommsTab)) ? parsed.defaultCommsTab as CommTab : DEFAULTS.defaultCommsTab,
    canvasColor: validColor(parsed.canvasColor, DEFAULTS.canvasColor),
    sidebarColor: validColor(parsed.sidebarColor, DEFAULTS.sidebarColor),
  };
}
function loadSettings(): UISettings {
  if (typeof localStorage === 'undefined') return DEFAULTS;
  try {
    const direct = localStorage.getItem(SETTINGS_KEY);
    if (direct) return sanitize(JSON.parse(direct));
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const migrated: Partial<UISettings> = {
          screenScale: parsed.screenScale as ScreenScale,
          fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : (typeof parsed.fontOffset === 'number' ? 16.5 + parsed.fontOffset : undefined),
          navMode: parsed.navMode as NavMode,
          leadDensity: parsed.leadDensity as 'standard' | 'compact',
          motion: parsed.motion as 'normal' | 'reduced',
          defaultCommsTab: parsed.defaultCommsTab as CommTab,
          canvasColor: (parsed.canvasColor || parsed.bgCanvas) as string,
          sidebarColor: (parsed.sidebarColor || parsed.bgConsole) as string,
        };
        return sanitize(migrated);
      }
    }
  } catch { /* optional preferences must never break the CRM */ }
  return DEFAULTS;
}
function saveSettings(settings: UISettings): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore storage failures */ }
}

const initial = loadSettings();
export const useStore = create<AppState>((set) => ({
  leads: INITIAL_LEADS,
  ...initial,
  setSetting: (key, value) => set((state) => {
    const normalized = key === 'fontSize' ? clampFontSize(value) : value;
    const next = { ...state, [key]: normalized } as AppState;
    saveSettings({
      screenScale: next.screenScale,
      fontSize: next.fontSize,
      navMode: next.navMode,
      leadDensity: next.leadDensity,
      motion: next.motion,
      defaultCommsTab: next.defaultCommsTab,
      canvasColor: next.canvasColor,
      sidebarColor: next.sidebarColor,
    });
    return { [key]: normalized } as Partial<AppState>;
  }),
  setNavMode: (navMode) => set((state) => {
    const next = { ...state, navMode };
    saveSettings({
      screenScale: next.screenScale,
      fontSize: next.fontSize,
      navMode,
      leadDensity: next.leadDensity,
      motion: next.motion,
      defaultCommsTab: next.defaultCommsTab,
      canvasColor: next.canvasColor,
      sidebarColor: next.sidebarColor,
    });
    return { navMode };
  }),
}));
