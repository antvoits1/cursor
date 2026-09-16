import type { Lead } from '../../data/types';
import { whatsappHref } from '../../lib/format';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

function Field({
  label,
  first,
  children,
}: {
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`contact-field${first ? ' email-first' : ''}`}>
      <div className="contact-key">{label}</div>
      <div className="contact-val">{children}</div>
    </div>
  );
}

export function ContactGrid({ lead }: { lead: Lead }) {
  const { dialNumber, messageLead, emailContact } = useCrm();

  return (
    <div className="contact-field-grid">
      {lead.mobiles.map((p) => (
        <Field key={`${p.label}-${p.number}`} label="Mobile">
          <button type="button" className="link" onClick={() => dialNumber(p.number)}>
            {p.number}
          </button>
          <span className="contact-actions">
            <button
              type="button"
              className="mini-action"
              title="SMS"
              aria-label={`SMS ${p.number}`}
              onClick={() => messageLead(lead.id)}
            >
              <Icon name="sms" size={11} />
            </button>
            <a
              className="mini-action"
              title="WhatsApp"
              aria-label={`WhatsApp ${p.number}`}
              href={whatsappHref(p.number)}
              target="_blank"
              rel="noopener"
            >
              <Icon name="wa" size={11} />
            </a>
          </span>
        </Field>
      ))}
      {lead.landlines.map((p) => (
        <Field key={`${p.label}-${p.number}`} label="Landline">
          <button type="button" className="link" onClick={() => dialNumber(p.number)}>
            {p.number}
          </button>
        </Field>
      ))}
      {lead.emails.map((e, i) => (
        <Field key={`${e.label}-${e.address}`} label="Email" first={i === 0}>
          <button type="button" className="link" onClick={() => emailContact(e.address)}>
            {e.address}
          </button>
        </Field>
      ))}
    </div>
  );
}
