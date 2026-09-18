import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { CANVAS_COLORS, NAV_COLORS, type UISettings } from '../store';

interface Props {
  settings: UISettings;
  token: string;
  authRequired: boolean;
  mock: boolean;
  setSetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void;
  onTokenChange: (value: string) => void;
  onClose: () => void;
}
function ColorPicker({ value, colors, onChange }: { value: string; colors: string[]; onChange: (value: string) => void }) {
  return <div className="settings-color-grid" role="radiogroup">{colors.map(color => <button key={color} type="button" className={`settings-color-swatch ${value.toUpperCase() === color.toUpperCase() ? 'active' : ''}`} style={{ backgroundColor: color }} onClick={() => onChange(color)} title={color} aria-label={`Use ${color}`} aria-checked={value.toUpperCase() === color.toUpperCase()} role="radio"/>)}</div>;
}
export default function SettingsModal({ settings, token, authRequired, mock, setSetting, onTokenChange, onClose }: Props) {
  const changeFont = (delta: number) => setSetting('fontSize', Math.max(14.5, Math.min(20, settings.fontSize + delta)));
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-head"><h2>Desk Phone Settings</h2><button type="button" onClick={onClose} aria-label="Close settings">×</button></div>
        <div className="settings-scroll">
          <Setting label="Windows bridge token" help={mock || !authRequired ? 'The local mock does not require a token. On a real Windows PC paste the contents of %LOCALAPPDATA%\\iPhoneLinkCRM\\bridge-token.txt.' : 'Paste the token from %LOCALAPPDATA%\\iPhoneLinkCRM\\bridge-token.txt. /health is public; call, SMS, and extract routes need this header.'}>
            <input type="password" value={token} onChange={e => onTokenChange(e.target.value)} placeholder="X-iPhoneLink-Token" autoComplete="off"/>
          </Setting>
          <Setting label="Screen Scale" help="Auto chooses the layout for the screen. Ultra-Wide is tuned for a 32-inch display.">
            <select value={settings.screenScale} onChange={e => setSetting('screenScale', e.target.value as UISettings['screenScale'])}><option value="auto">Auto (Recommended)</option><option value="standard">Standard</option><option value="wide">Wide</option><option value="ultra">Ultra-Wide</option></select>
          </Setting>
          <Setting label="Font / Icon Size" help="Inter is used everywhere. Each click changes the dialer by 0.5px.">
            <div className="settings-stepper"><button type="button" onClick={() => changeFont(-0.5)} disabled={settings.fontSize <= 14.5}><Minus size={16}/></button><strong>{settings.fontSize.toFixed(1)} px</strong><button type="button" onClick={() => changeFont(0.5)} disabled={settings.fontSize >= 20}><Plus size={16}/></button></div>
          </Setting>
          <Setting label="Default left pane" help="The keypad stays on the right so a number can be typed immediately. This only picks Messages, Recents, Contacts, or Mail.">
            <select value={settings.defaultCommsTab} onChange={e => setSetting('defaultCommsTab', e.target.value as UISettings['defaultCommsTab'])}><option value="recents">Recents</option><option value="messages">Messages</option><option value="contacts">Contacts</option><option value="mail">Mail</option></select>
          </Setting>
          <Setting label="Canvas / Page Background" help="Changes the space around the desk-phone panels."><ColorPicker value={settings.canvasColor} colors={CANVAS_COLORS} onChange={value => setSetting('canvasColor', value)}/></Setting>
          <Setting label="Top bar Color" help="Color of the Desk Phone header."><ColorPicker value={settings.sidebarColor} colors={NAV_COLORS} onChange={value => setSetting('sidebarColor', value)}/></Setting>
          <Setting label="Motion" help="Reduced motion removes non-essential animations.">
            <select value={settings.motion} onChange={e => setSetting('motion', e.target.value as UISettings['motion'])}><option value="normal">Normal</option><option value="reduced">Reduced</option></select>
          </Setting>
        </div>
      </div>
    </div>
  );
}
function Setting({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <section className="settings-row"><label>{label}</label><p>{help}</p>{children}</section>;
}
