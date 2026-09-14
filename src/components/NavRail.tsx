import { useEffect, useRef, useState } from 'react';
import { Users, MessageSquareText, Mail, ScanLine, TerminalSquare, Bell, Settings } from 'lucide-react';
import { isLightColor } from '../lib/format';
import type { ActivePage } from '../lib/navigation';
import type { CrmNotification } from '../lib/notifications';
import NotificationPopup from './NotificationPopup';

interface Props {
  isTop: boolean;
  isWide: boolean;
  navColor: string;
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  cycleNavMode: () => void;
  onOpenSettings: () => void;
  notifications: CrmNotification[];
  readIds: Set<string>;
  onOpenNotification: (item: CrmNotification) => void;
  onMarkAllRead: () => void;
}

const NAV_ITEMS = [
  { id: 'crm' as const, icon: Users, label: 'Leads' },
  { id: 'messages' as const, icon: MessageSquareText, label: 'Messages' },
  { id: 'email' as const, icon: Mail, label: 'Email' },
  { id: 'scanner' as const, icon: ScanLine, label: 'Scanner' },
  { id: 'command' as const, icon: TerminalSquare, label: 'Command' },
];

function TrafficDots({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="forge-traffic" onClick={onClick} title="Switch navigation layout" aria-label="Switch navigation layout">
      <span className="forge-dot red"/><span className="forge-dot yellow"/><span className="forge-dot green"/>
    </button>
  );
}

export default function NavRail({ isTop, isWide, navColor, activePage, setActivePage, cycleNavMode, onOpenSettings, notifications, readIds, onOpenNotification, onMarkAllRead }: Props) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const light = isLightColor(navColor);
  const unread = notifications.filter(item => !readIds.has(item.id)).length;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (bellRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-notif-popup]')) return;
      setNotifOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setNotifOpen(false); };
    const onResize = () => setNotifOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [notifOpen]);

  const toggleNotifications = () => {
    if (notifOpen) { setNotifOpen(false); return; }
    const rect = bellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAccountOpen(false);
    setAnchorRect(rect);
    setNotifOpen(true);
  };
  const openItem = (item: CrmNotification) => { setNotifOpen(false); onOpenNotification(item); };

  const popup = notifOpen && anchorRect ? (
    <NotificationPopup anchorRect={anchorRect} anchor={isTop ? 'topbar' : 'sidebar'} items={notifications} readIds={readIds} onOpen={openItem} onMarkAllRead={onMarkAllRead}/>
  ) : null;
  const badge = unread > 0 ? <span className="forge-notif-badge">{unread > 9 ? '9+' : unread}</span> : null;

  if (isTop) {
    return (
      <>
        <header className={`forge-topbar ${light ? 'light' : 'dark'}`} style={{ backgroundColor: navColor }}>
          <TrafficDots onClick={cycleNavMode}/>
          <div className="forge-brand">Forge<span>CRM</span></div>
          <nav className="forge-topnav" aria-label="Primary">
            {NAV_ITEMS.map(item => (
              <button key={item.id} type="button" onClick={() => setActivePage(item.id)} className={`forge-topnav-tab ${activePage === item.id ? 'active' : ''}`}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="forge-topbar-spacer"/>
          <button type="button" ref={bellRef} className="forge-tool forge-bell" onClick={toggleNotifications} title="Notifications" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={notifOpen}>
            <Bell size={20} strokeWidth={1.8}/>
            {badge}
          </button>
          <div className="forge-account" ref={menuRef}>
            <button type="button" className="forge-avatar" onClick={() => { setNotifOpen(false); setAccountOpen(v => !v); }} aria-expanded={accountOpen} aria-label="Account menu">CB</button>
            {accountOpen && (
              <div className="forge-account-menu">
                <button type="button" onClick={() => { setAccountOpen(false); onOpenSettings(); }}>Settings</button>
                <button type="button" disabled title="No authentication service is connected to this build">Log Out</button>
              </div>
            )}
          </div>
        </header>
        {popup}
      </>
    );
  }

  return (
    <>
      <aside className={`forge-sidebar ${isWide ? 'wide' : 'slim'} ${light ? 'light' : 'dark'}`} style={{ backgroundColor: navColor }}>
        <div className="forge-sidebar-head">
          <TrafficDots onClick={cycleNavMode}/>
          {isWide && <div className="forge-sidebar-brand">Forge<span>CRM</span></div>}
        </div>
        <nav className="forge-sidebar-nav" aria-label="Primary">
          {isWide && <div className="forge-workspace-label">WORKSPACE</div>}
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => setActivePage(item.id)} className={`forge-side-tab ${activePage === item.id ? 'active' : ''}`} title={item.label}>
                <Icon size={19} strokeWidth={1.7}/>{isWide && <span>{item.label}</span>}
              </button>
            );
          })}
          <button type="button" ref={bellRef} className="forge-side-tab forge-bell" onClick={toggleNotifications} title="Notifications" aria-haspopup="dialog" aria-expanded={notifOpen}>
            <Bell size={19} strokeWidth={1.7}/>{isWide && <span>Notifications</span>}
            {badge}
          </button>
        </nav>
        <div className="forge-sidebar-bottom">
          <button type="button" onClick={onOpenSettings} className="forge-side-tab" title="Settings">
            <Settings size={19} strokeWidth={1.7}/>{isWide && <span>Settings</span>}
          </button>
        </div>
      </aside>
      {popup}
    </>
  );
}
