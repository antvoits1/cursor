import { Dialer } from '../dialer/Dialer';
import { Icon } from '../Icon';

export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        <Icon name="logo" size={18} strokeWidth={2.2} />
        NorthVector
      </div>
      <Dialer />
      <div className="topbar-right">
        <button type="button" className="topbar-btn" title="Notifications" aria-label="Notifications">
          <Icon name="bell" size={17} />
        </button>
      </div>
    </header>
  );
}
