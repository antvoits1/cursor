import { useEffect, useState } from 'react';
import { useStore, type UISettings } from './store';
import { usePhoneBridge } from './lib/bridge';
import DeskPhone from './components/DeskPhone';
import SettingsModal from './components/SettingsModal';

function autoScaleMode(): 'standard' | 'wide' | 'ultra' {
  const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  if (width >= 2400) return 'ultra';
  if (width >= 1600) return 'wide';
  return 'standard';
}
function scaleValue(mode: string): number { return mode === 'ultra' ? 1.04 : mode === 'wide' ? 1 : .96; }

export default function App() {
  const { screenScale, fontSize, defaultCommsTab, canvasColor, sidebarColor, motion, setSetting } = useStore();
  const bridge = usePhoneBridge();
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const apply = () => {
      const resolved = screenScale === 'auto' ? autoScaleMode() : screenScale;
      document.documentElement.style.setProperty('--ui-scale', String(scaleValue(resolved)));
      document.documentElement.style.setProperty('--font-offset', `${fontSize - 16.5}px`);
      document.documentElement.style.setProperty('--font-family-main', "'Inter', system-ui, sans-serif");
      document.documentElement.style.setProperty('--bg-canvas', canvasColor);
      document.documentElement.style.setProperty('--desk-nav', sidebarColor);
      document.documentElement.dataset.screenScale = resolved;
      document.documentElement.dataset.motion = motion;
    };
    apply();
    if (screenScale === 'auto') { window.addEventListener('resize', apply); return () => window.removeEventListener('resize', apply); }
  }, [screenScale, fontSize, motion, canvasColor, sidebarColor]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(current => current === message ? '' : current), 2800);
  };

  const settings: UISettings = { screenScale, fontSize, defaultCommsTab, canvasColor, sidebarColor, motion };

  return (
    <>
      <DeskPhone bridge={bridge} defaultTab={defaultCommsTab} navColor={sidebarColor} onOpenSettings={() => setShowSettings(true)} onNotice={showNotice}/>
      {showSettings && <SettingsModal settings={settings} token={bridge.token} authRequired={bridge.authRequired} mock={bridge.mock} setSetting={setSetting} onTokenChange={bridge.setToken} onClose={() => setShowSettings(false)}/>}
      {notice && <div className="forge-toast" role="status" aria-live="polite">{notice}</div>}
    </>
  );
}
