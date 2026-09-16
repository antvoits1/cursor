import { useCrm } from '../../state/CrmContext';
import type { MailFolder } from '../../data/types';
import { Icon } from '../Icon';
import { ComposeEmailView } from './ComposeEmailView';
import { EmailOpenView } from './EmailOpenView';

const FOLDERS: Array<{ id: MailFolder; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
];

export function EmailView() {
  const { mails, mailFolder, setMailFolder, openMailId, compose, openMail, startEmailCompose } =
    useCrm();

  if (compose === 'email') return <ComposeEmailView />;
  if (openMailId) return <EmailOpenView mailId={openMailId} />;

  const filtered = mails.filter((m) => m.folder === mailFolder);

  return (
    <>
      <div className="comm-toolbar">
        <select
          className="folder-select"
          aria-label="Mail folder"
          value={mailFolder}
          onChange={(e) => setMailFolder(e.target.value as MailFolder)}
        >
          {FOLDERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="head-spacer" />
        <button
          type="button"
          className="icon-btn"
          title="Compose email"
          aria-label="Compose email"
          onClick={() => startEmailCompose()}
        >
          <Icon name="compose" size={13} />
        </button>
      </div>
      <div className="mail-list">
        {filtered.length === 0 && <div className="empty-note">No mail</div>}
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mail-row${m.unread ? ' unread' : ''}`}
            onClick={() => openMail(m.id)}
          >
            <div className="mail-top">
              <span className="mail-from">{m.folder === 'sent' ? m.to : m.from}</span>
              <span className="mail-time">{m.time}</span>
            </div>
            <div className="mail-subject">{m.subject}</div>
            <div className="mail-preview">{m.preview}</div>
          </button>
        ))}
      </div>
    </>
  );
}
