import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Users, MessageSquare, Mail, ScanLine, TerminalSquare, Bell, Settings, Phone } from 'lucide-react';
import { useStore } from '../store';
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
  { id: 'messages' as const, icon: MessageSquare, label: 'Messages' },
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

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="forge-notif-badge">{count > 9 ? '9+' : count}</span>;
}

export default function NavRail({ isTop, isWide, navColor, activePage, setActivePage, cycleNavMode, onOpenSettings, notifications, readIds, onOpenNotification, onMarkAllRead }: Props) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const light = isLightColor(navColor);
  const unreadCount = notifications.reduce((count, item) => readIds.has(item.id) ? count : count + 1, 0);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || bellRef.current?.contains(target)) return;
      if ((event.target as HTMLElement | null)?.closest?.('[data-notif-popup]')) return;
      setAccountOpen(false);
      setNotifOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggleNotifications = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setAccountOpen(false);
    if (notifOpen) {
      setNotifOpen(false);
      return;
    }
    setAnchorRect(event.currentTarget.getBoundingClientRect());
    setNotifOpen(true);
  };

  const openItem = (item: CrmNotification) => {
    setNotifOpen(false);
    onOpenNotification(item);
  };

  const popup = notifOpen && anchorRect ? (
    <NotificationPopup variant={isTop ? 'topbar' : 'sidebar'} anchorRect={anchorRect} items={notifications} readIds={readIds} onOpen={openItem} onMarkAllRead={onMarkAllRead}/>
  ) : null;

  const { setCallState } = useStore();
  
  const forceDialer = () => {
    setCallState({
      status: 'connected',
      number: '(555) 019-2834',
      startTime: Date.now(),
      isMuted: false,
      isOnHold: false
    });
  };

  if (isTop) {
    return (
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
        <button ref={bellRef} type="button" className={`forge-tool forge-bell ${notifOpen ? 'active' : ''}`} onClick={toggleNotifications} title="Notifications" aria-label="Notifications" aria-expanded={notifOpen} aria-haspopup="dialog" data-notif-bell>
          <Bell size={20} strokeWidth={1.8}/>
          <UnreadBadge count={unreadCount}/>
        </button>
        <button type="button" className="forge-tool" onClick={forceDialer} title="Test Dialer" aria-label="Test Dialer">
          <Phone size={20} strokeWidth={1.8}/>
        </button>
        {popup}
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
    );
  }

  return (
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
        <button ref={bellRef} type="button" onClick={toggleNotifications} className={`forge-side-tab forge-bell ${notifOpen ? 'active' : ''}`} title="Notifications" aria-expanded={notifOpen} aria-haspopup="dialog" data-notif-bell>
          <Bell size={19} strokeWidth={1.7}/>{isWide && <span>Notifications</span>}
          <UnreadBadge count={unreadCount}/>
        </button>
        {popup}
      </nav>
      <div className="forge-sidebar-bottom">
        <button type="button" onClick={forceDialer} className="forge-side-tab" title="Test Dialer">
          <Phone size={19} strokeWidth={1.7}/>{isWide && <span>Test Dialer</span>}
        </button>
        <button type="button" onClick={onOpenSettings} className="forge-side-tab" title="Settings">
          <Settings size={19} strokeWidth={1.7}/>{isWide && <span>Settings</span>}
        </button>
        <div className="forge-account" ref={menuRef}>
          <button type="button" className="forge-side-tab forge-avatar-btn" onClick={() => { setNotifOpen(false); setAccountOpen(v => !v); }} aria-expanded={accountOpen} aria-label="Account menu">
            <div className="forge-avatar-chip">CB</div>
            {isWide && <span>Account</span>}
          </button>
          {accountOpen && (
            <div className="forge-account-menu bottom-up">
              <button type="button" disabled title="No authentication service is connected to this build">Log Out</button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
