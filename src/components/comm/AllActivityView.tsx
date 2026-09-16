import { leads } from '../../data/leads';
import { buildAllEvents } from '../../lib/comm';
import { useCrm } from '../../state/CrmContext';
import { Icon, type IconName } from '../Icon';

const EVENT_ICONS: Record<string, IconName> = {
  messages: 'sms',
  calls: 'call',
  email: 'mail',
};

export function AllActivityView() {
  const { smsByLead, openEvent } = useCrm();
  const events = buildAllEvents(leads, smsByLead);

  return (
    <div className="ios-list">
      {events.map((e, i) => (
        <button
          key={`${e.kind}-${e.leadId}-${i}`}
          type="button"
          className="ios-row"
          onClick={() => openEvent(e.kind, e.leadId)}
        >
          <div className="event-icon">
            <Icon name={EVENT_ICONS[e.kind]} size={12} />
          </div>
          <div className="ios-row-main">
            <div className="ios-row-top">
              <span className="ios-row-name">{e.name}</span>
              <span className="ios-row-time">{e.time}</span>
            </div>
            <div className="ios-row-preview">{e.preview}</div>
          </div>
          <span className="ios-chevron">›</span>
        </button>
      ))}
    </div>
  );
}
