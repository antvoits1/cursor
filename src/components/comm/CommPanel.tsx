import { useCrm } from '../../state/CrmContext';
import type { CommTab } from '../../data/types';
import { AllActivityView } from './AllActivityView';
import { CallLogView } from './CallLogView';
import { ContactsView } from './ContactsView';
import { EmailView } from './EmailView';
import { MessagesView } from './MessagesView';

const TABS: Array<{ id: CommTab; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'messages', label: 'MESSAGES' },
  { id: 'calls', label: 'CALL LOG' },
  { id: 'contacts', label: 'CONTACTS' },
  { id: 'email', label: 'EMAIL' },
];

export function CommPanel() {
  const { commTab, setCommTab } = useCrm();

  return (
    <section className="panel" id="commPanel">
      <div className="comm-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`comm-tab${commTab === t.id ? ' active' : ''}`}
            onClick={() => setCommTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="comm-view">
        {commTab === 'all' && <AllActivityView />}
        {commTab === 'messages' && <MessagesView />}
        {commTab === 'calls' && <CallLogView />}
        {commTab === 'contacts' && <ContactsView />}
        {commTab === 'email' && <EmailView />}
      </div>
    </section>
  );
}
