import { useState } from 'react';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

export function EmailOpenView({ mailId }: { mailId: string }) {
  const { mails, closeMail, sendEmailReply } = useCrm();
  const [reply, setReply] = useState('');
  const [sentNote, setSentNote] = useState(false);

  const mail = mails.find((m) => m.id === mailId);
  if (!mail) return null;

  const send = () => {
    if (!reply.trim()) return;
    sendEmailReply(mailId, reply);
    setReply('');
    setSentNote(true);
  };

  return (
    <div className="mail-open">
      <div className="thread-head">
        <button type="button" className="back-btn" onClick={closeMail} aria-label="Back">
          <Icon name="back" size={16} />
        </button>
        <div className="thread-name">Email</div>
      </div>
      <div className="mail-head">
        <div className="mail-subject-open">{mail.subject}</div>
        <div className="mail-meta-open">
          {mail.from} → {mail.to} · {mail.time}
        </div>
      </div>
      <div className="mail-body">
        {mail.body.split('\n').map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
        {sentNote && <div className="activity-time">Reply sent · saved to Sent</div>}
      </div>
      <div className="reply-box">
        <textarea
          placeholder="Reply"
          aria-label="Reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
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
          disabled={!reply.trim()}
          onClick={send}
        >
          <Icon name="plane" size={13} />
        </button>
      </div>
    </div>
  );
}
