import { leads } from '../../data/leads';
import { buildThreads } from '../../lib/comm';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';
import { ComposeSmsView } from './ComposeSmsView';
import { ThreadView } from './ThreadView';

export function MessagesView() {
  const { smsByLead, threadLeadId, compose, openThread, startSmsCompose } = useCrm();

  if (compose === 'sms') return <ComposeSmsView />;
  if (threadLeadId) return <ThreadView leadId={threadLeadId} />;

  const threads = buildThreads(leads, smsByLead);

  return (
    <>
      <div className="comm-toolbar">
        <span className="comm-toolbar-title">Messages</span>
        <div className="head-spacer" />
        <button
          type="button"
          className="icon-btn"
          title="New message"
          aria-label="New message"
          onClick={startSmsCompose}
        >
          <Icon name="compose" size={13} />
        </button>
      </div>
      <div className="ios-list">
        {threads.map((t) => (
          <button
            key={t.leadId}
            type="button"
            className="ios-row"
            onClick={() => openThread(t.leadId)}
          >
            <div className="event-icon">
              <Icon name="sms" size={12} />
            </div>
            <div className="ios-row-main">
              <div className="ios-row-top">
                <span className="ios-row-name">{t.name}</span>
                <span className="ios-row-time">{t.time}</span>
              </div>
              <div className="ios-row-preview">{t.preview}</div>
            </div>
            <span className="ios-chevron">›</span>
          </button>
        ))}
      </div>
    </>
  );
}
