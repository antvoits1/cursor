import { useState } from 'react';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

export function ComposeEmailView() {
  const { composeEmailTo, cancelCompose, sendEmail } = useCrm();
  const [to, setTo] = useState(composeEmailTo);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const send = () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    sendEmail(to, subject, body);
  };

  return (
    <div className="compose-pane">
      <div className="thread-head">
        <button type="button" className="back-btn" onClick={cancelCompose} aria-label="Back">
          <Icon name="back" size={16} />
        </button>
        <div className="thread-name">New Email</div>
      </div>
      <div className="compose-line">
        <label htmlFor="emailTo">To:</label>
        <input id="emailTo" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="compose-line">
        <label htmlFor="emailSubject">Subject:</label>
        <input id="emailSubject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <textarea
        className="compose-body"
        placeholder="Message"
        aria-label="Message"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="compose-actions">
        <button
          type="button"
          className="send-btn"
          aria-label="Send"
          disabled={!to.trim() || !subject.trim() || !body.trim()}
          onClick={send}
        >
          <Icon name="plane" size={13} />
        </button>
      </div>
    </div>
  );
}
