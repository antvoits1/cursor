import { useState } from 'react';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

export function ComposeSmsView() {
  const { cancelCompose, sendComposedSms } = useCrm();
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');

  const send = () => {
    if (!to.trim() || !body.trim()) return;
    sendComposedSms(to, body);
  };

  return (
    <div className="compose-pane">
      <div className="thread-head">
        <button type="button" className="back-btn" onClick={cancelCompose} aria-label="Back">
          <Icon name="back" size={16} />
        </button>
        <div className="thread-name">New Message</div>
      </div>
      <div className="compose-line">
        <label htmlFor="smsTo">To:</label>
        <input
          id="smsTo"
          placeholder="Name or number"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div style={{ flex: 1 }} />
      <div className="composer">
        <textarea
          className="compose-field"
          rows={1}
          placeholder="iMessage"
          aria-label="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
          disabled={!to.trim() || !body.trim()}
          onClick={send}
        >
          <Icon name="plane" size={13} />
        </button>
      </div>
    </div>
  );
}
