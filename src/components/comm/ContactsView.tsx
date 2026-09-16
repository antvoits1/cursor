import { leads } from '../../data/leads';
import { useCrm } from '../../state/CrmContext';

export function ContactsView() {
  const { dialNumber, emailContact } = useCrm();
  const sorted = [...leads].sort((a, b) => a.contact.localeCompare(b.contact));

  let lastLetter = '';

  return (
    <>
      <div className="comm-toolbar">
        <span className="comm-toolbar-title">Contacts</span>
      </div>
      <div className="contact-list">
        {sorted.map((c) => {
          const letter = c.contact.charAt(0).toUpperCase();
          const showLetter = letter !== lastLetter;
          lastLetter = letter;
          const mobile = c.mobiles[0]?.number || '';
          const email = c.emails[0]?.address || '';
          return (
            <div key={c.id}>
              {showLetter && <div className="contact-letter">{letter}</div>}
              <div className="contact-row">
                <div className="contact-name">{c.contact}</div>
                <div className="contact-company">{c.company}</div>
                <div className="contact-links">
                  <button type="button" className="link" onClick={() => dialNumber(mobile)}>
                    {mobile}
                  </button>
                  <button type="button" className="link" onClick={() => emailContact(email)}>
                    {email}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
