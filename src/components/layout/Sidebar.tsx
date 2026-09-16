import { useCrm } from '../../state/CrmContext';
import { Icon, type IconName } from '../Icon';

interface NavItem {
  label: string;
  icon: IconName;
  active?: boolean;
  onClick?: () => void;
}

export function Sidebar() {
  const { setCommTab } = useCrm();

  const items: NavItem[] = [
    { label: 'Leads', icon: 'leads', active: true },
    { label: 'Messages', icon: 'sms', onClick: () => setCommTab('messages') },
    { label: 'Email', icon: 'mail', onClick: () => setCommTab('email') },
    { label: 'Scanner', icon: 'scanner' },
    { label: 'Command', icon: 'command' },
    { label: 'Notifications', icon: 'bell' },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-section-label">Workspace</div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`nav-item${item.active ? ' active' : ''}`}
          onClick={item.onClick}
        >
          <Icon name={item.icon} size={14} strokeWidth={2} />
          {item.label}
        </button>
      ))}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div>
            <div className="sidebar-user-name">Marcus Webb</div>
            <div className="sidebar-user-role">Senior AE</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
