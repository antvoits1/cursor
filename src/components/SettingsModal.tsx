import { Minus, Plus } from 'lucide-react';
import { CANVAS_COLORS, NAV_COLORS, type UISettings } from '../store';

interface Props {
  settings: UISettings;
  setSetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void;
  onResetPanels: () => void;
  onClose: () => void;
}
function ColorPicker({ value, colors, onChange }: { value: string; colors: string[]; onChange: (value: string) => void }) {
  return <div className="settings-color-grid" role="radiogroup">{colors.map(color => <button key={color} type="button" className={`settings-color-swatch ${value.toUpperCase() === color.toUpperCase() ? 'active' : ''}`} style={{ backgroundColor: color }} onClick={() => onChange(color)} title={color} aria-label={`Use ${color}`} aria-checked={value.toUpperCase() === color.toUpperCase()} role="radio"/>)}</div>;
}
export default function SettingsModal({ settings, setSetting, onResetPanels, onClose }: Props) {
  const changeFont = (delta: number) => setSetting('fontSize', Math.max(14.5, Math.min(20, settings.fontSize + delta)));
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-head"><h2>Advanced Settings</h2><button type="button" onClick={onClose} aria-label="Close settings">×</button></div>
        <div className="settings-scroll">
          <Setting label="Screen Scale" help="Auto chooses the layout for the screen. Ultra-Wide is tuned for a 32-inch display.">
            <select value={settings.screenScale} onChange={e => setSetting('screenScale', e.target.value as UISettings['screenScale'])}><option value="auto">Auto (Recommended)</option><option value="standard">Standard</option><option value="wide">Wide</option><option value="ultra">Ultra-Wide</option></select>
          </Setting>
          <Setting label="Font / Icon Size" help="Inter is used everywhere. Each click changes the full CRM by 0.5px.">
            <div className="settings-stepper"><button type="button" onClick={() => changeFont(-0.5)} disabled={settings.fontSize <= 14.5}><Minus size={16}/></button><strong>{settings.fontSize.toFixed(1)} px</strong><button type="button" onClick={() => changeFont(0.5)} disabled={settings.fontSize >= 20}><Plus size={16}/></button></div>
          </Setting>
          <Setting label="Navigation Style" help="Use the text topbar, compact sidebar icons, or the wide sidebar.">
            <select value={settings.navMode} onChange={e => setSetting('navMode', e.target.value as UISettings['navMode'])}><option value="topbar">Top bar (Recommended)</option><option value="sidebar-slim">Sidebar icons</option><option value="sidebar-wide">Wide sidebar with tabs</option></select>
          </Setting>
          <Setting label="Panel Density" help="Comfortable adds breathing room. Compact shows more lead rows.">
            <select value={settings.leadDensity} onChange={e => setSetting('leadDensity', e.target.value as UISettings['leadDensity'])}><option value="standard">Comfortable</option><option value="compact">Compact</option></select>
          </Setting>
          <Setting label="Default Communications Tab" help="Choose which Communications view opens first.">
            <select value={settings.defaultCommsTab} onChange={e => setSetting('defaultCommsTab', e.target.value as UISettings['defaultCommsTab'])}><option value="all">All</option><option value="messages">Messages</option><option value="calls">Call log</option><option value="contacts">Contacts</option><option value="email">Email</option></select>
          </Setting>
          <Setting label="Canvas / Page Background" help="Changes the real space around and between the CRM panels."><ColorPicker value={settings.canvasColor} colors={CANVAS_COLORS} onChange={value => setSetting('canvasColor', value)}/></Setting>
          <Setting label="Topbar / Sidebar Color" help="One shared color keeps all navigation modes visually consistent."><ColorPicker value={settings.sidebarColor} colors={NAV_COLORS} onChange={value => setSetting('sidebarColor', value)}/></Setting>
          <Setting label="Motion" help="Reduced motion removes non-essential animations.">
            <select value={settings.motion} onChange={e => setSetting('motion', e.target.value as UISettings['motion'])}><option value="normal">Normal</option><option value="reduced">Reduced</option></select>
          </Setting>
          <div className="settings-actions"><button type="button" onClick={onResetPanels}>Reset panel widths</button></div>
        </div>
      </div>
    </div>
  );
}
function Setting({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return <section className="settings-row"><label>{label}</label><p>{help}</p>{children}</section>;
}
