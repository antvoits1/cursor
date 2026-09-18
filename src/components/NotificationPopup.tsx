import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Mail, MessageCircle, MessageSquare, Phone } from 'lucide-react';
import type { CrmNotification } from '../lib/notifications';

interface Props {
  anchorRect: DOMRect;
  variant: 'topbar' | 'sidebar';
  items: CrmNotification[];
  readIds: Set<string>;
  onOpen: (item: CrmNotification) => void;
  onMarkAllRead: () => void;
}

const POPUP_WIDTH = 340;
const POPUP_MAX_HEIGHT = 460;

function KindIcon({ kind }: { kind: CrmNotification['kind'] }) {
  if (kind === 'wa') return <MessageCircle size={15} strokeWidth={1.8}/>;
  if (kind === 'email') return <Mail size={15} strokeWidth={1.8}/>;
  if (kind === 'call') return <Phone size={15} strokeWidth={1.8}/>;
  if (kind === 'follow') return <CalendarClock size={15} strokeWidth={1.8}/>;
  return <MessageSquare size={15} strokeWidth={1.8}/>;
}

export default function NotificationPopup({ anchorRect, variant, items, readIds, onOpen, onMarkAllRead }: Props) {
  const unread = items.filter(item => !readIds.has(item.id)).length;
  const style: CSSProperties = variant === 'topbar'
    ? { top: anchorRect.bottom + 8, left: Math.max(8, anchorRect.right - POPUP_WIDTH) }
    : { top: Math.max(8, Math.min(anchorRect.top, window.innerHeight - POPUP_MAX_HEIGHT - 16)), left: anchorRect.right + 8 };
  return createPortal(
    <div className="forge-notif-popup" data-notif-popup role="dialog" aria-label="Notifications" style={style}>
      <header className="forge-notif-head">
        <strong>Notifications</strong>
        {unread > 0 && <span className="forge-notif-count">{unread} new</span>}
        {unread > 0 && <button type="button" className="forge-notif-markall" onClick={onMarkAllRead}>Mark all read</button>}
      </header>
      <div className="forge-notif-list">
        {!items.length && <div className="forge-notif-empty">No notifications</div>}
        {items.map(item => {
          const isRead = readIds.has(item.id);
          return (
            <button type="button" key={item.id} className={`forge-notif-row ${isRead ? 'read' : ''}`} onClick={() => onOpen(item)}>
              <span className={`forge-notif-icon ${item.kind}`}><KindIcon kind={item.kind}/></span>
              <span className="forge-notif-copy">
                <span className="forge-notif-top"><strong>{item.title}</strong><time>{item.when}</time></span>
                <span className="forge-notif-sub">{item.sub}</span>
                <span className="forge-notif-body">{item.body}</span>
              </span>
              {!isRead && <span className="forge-notif-dot"/>}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
