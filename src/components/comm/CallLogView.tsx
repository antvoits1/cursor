import { leads } from '../../data/leads';
import { buildCallLog } from '../../lib/comm';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

export function CallLogView() {
  const { sessionCalls, callNumber, messageLead } = useCrm();
  const calls = buildCallLog(leads, sessionCalls);

  return (
    <>
      <div className="comm-toolbar">
        <span className="comm-toolbar-title">Call Log</span>
      </div>
      <div className="ios-list">
        {calls.map((c) => (
          <div className="call-row" key={c.id}>
            <div className="call-icon">
              <Icon name="call" size={12} />
            </div>
            <div>
              <div className="call-name">{c.who}</div>
              <div className="call-meta">
                {c.dir === 'in' ? 'Incoming' : 'Outgoing'} · {c.duration} · {c.device}
              </div>
            </div>
            <div className="call-time">{c.when}</div>
            <div className="call-actions">
              <button
                type="button"
                className="mini-action"
                title="Call"
                aria-label={`Call ${c.who}`}
                onClick={() => callNumber(c.number)}
              >
                <Icon name="call" size={11} />
              </button>
              <button
                type="button"
                className="mini-action"
                title="SMS"
                aria-label={`SMS ${c.who}`}
                onClick={() => c.leadId && messageLead(c.leadId)}
                disabled={!c.leadId}
              >
                <Icon name="sms" size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
