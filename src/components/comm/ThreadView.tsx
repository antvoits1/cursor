import { useEffect, useRef, useState } from 'react';
import { leads } from '../../data/leads';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

export function ThreadView({ leadId }: { leadId: string }) {
  const { smsByLead, closeThread, sendSms } = useCrm();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const lead = leads.find((l) => l.id === leadId);
  const messages = smsByLead[leadId] || [];
  const primary = lead?.mobiles[0]?.number || '';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!lead) return null;

  const send = () => {
    if (!draft.trim()) return;
    sendSms(leadId, draft);
    setDraft('');
  };

  return (
    <div className="thread">
      <div className="thread-head">
        <button type="button" className="back-btn" onClick={closeThread} aria-label="Back">
          <Icon name="back" size={16} />
        </button>
        <div>
          <div className="thread-name">{lead.contact}</div>
          <div className="thread-sub">{primary}</div>
        </div>
      </div>
      <div className="messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i}>
            <div className="timestamp">{m.time}</div>
            <div className={`bubble-row${m.dir === 'out' ? ' me' : ''}`}>
              <div className="bubble">{m.text}</div>
            </div>
            {m.dir === 'out' && <div className="delivery">Delivered</div>}
          </div>
        ))}
      </div>
      <div className="composer">
        <textarea
          className="compose-field"
          rows={1}
          placeholder="iMessage"
          aria-label="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className="send-btn"
          aria-label="Send"
          disabled={!draft.trim()}
          onClick={send}
        >
          <Icon name="plane" size={13} />
        </button>
      </div>
    </div>
  );
}
