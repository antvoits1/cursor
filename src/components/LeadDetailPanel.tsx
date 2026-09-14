import { FileText, Mail, MessageCircle, MessageSquareText, Phone } from 'lucide-react';
import type { Lead } from '../data';
import { formatFinancialUp, formatMoneyWhole, generateSalesPitch } from '../lib/format';
import { whatsappHref } from '../lib/comm';

interface Props {
  lead: Lead;
  onCall: (number: string) => void;
  onOpenMessages: (number?: string) => void;
  setViewerDocIndex: (index: number) => void;
  showApproval: boolean;
}

function PhoneActions({ number, onCall, onMessage, whatsapp = false }: { number: string; onCall: () => void; onMessage?: () => void; whatsapp?: boolean }) {
  return (
    <span className="detail-quick-actions">
      <button type="button" className="detail-action-call" onClick={onCall} title="Call" aria-label={`Call ${number}`}><Phone size={14} strokeWidth={1.9}/></button>
      {onMessage && <button type="button" onClick={onMessage} title="SMS" aria-label={`Message ${number}`}><MessageSquareText size={14} strokeWidth={1.9}/></button>}
      {whatsapp && <a href={whatsappHref(number)} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${number}`}><MessageCircle size={14} strokeWidth={1.9}/></a>}
    </span>
  );
}

function positionTone(pos: string): 'teal' | 'amber' | 'neutral' {
  if (pos.startsWith('1')) return 'teal';
  if (pos.startsWith('2')) return 'amber';
  return 'neutral';
}

function activityMeta(what: string) {
  const text = what.toLowerCase();
  if (text.includes('sms') || text.includes('whatsapp')) return { tone: 'teal' as const, Icon: MessageSquareText };
  if (text.includes('email')) return { tone: 'amber' as const, Icon: Mail };
  if (text.includes('call')) return { tone: 'blue' as const, Icon: Phone };
  return { tone: 'neutral' as const, Icon: FileText };
}

export default function LeadDetailPanel({ lead, onCall, onOpenMessages, setViewerDocIndex, showApproval }: Props) {
  const latestDocIndex = lead.mtd ? -1 : 0;
  const approval = lead.avg + 150000;
  const companyFields: Array<[string,string]> = [
    ['DBA', lead.dba],
    ['Industry', lead.industry.split('·')[0].trim()],
    ['Entity', lead.entity],
    ['Time in Biz', lead.tib],
    ['Started', lead.started],
    ['EIN', lead.ein],
    ['SSN', lead.ssn],
    ['DOB', lead.dob],
    ['Website', lead.website],
  ];
  const finCards: Array<{ label: string; value: string; bar: 'blue' | 'navy' | 'amber' | 'teal' | 'neutral' }> = [
    { label: 'Monthly revenue', value: formatMoneyWhole(lead.avg), bar: 'blue' },
    { label: 'Requested', value: formatMoneyWhole(lead.ask), bar: 'navy' },
    { label: 'Offer on file', value: lead.offer ? formatMoneyWhole(lead.offer) : 'Pending', bar: lead.offer ? 'amber' : 'neutral' },
    { label: 'Current balance', value: formatMoneyWhole(lead.bank.bal), bar: 'teal' },
  ];

  return (
    <div className="detail-scroll">
      <header className="detail-header">
        <div className="detail-company-line">
          <div className="detail-company-copy">
            <h1>{lead.company}</h1>
            <div className="detail-contact-name">{lead.contact} · {lead.title}</div>
            <div className="detail-tags">
              <span className={`detail-pill ${positionTone(lead.pos)}`}>{lead.pos} position</span>
              <span className="detail-tag">{lead.city}</span>
            </div>
          </div>
          {showApproval && <div className="detail-header-approval"><span>Approval</span><strong>{formatFinancialUp(approval)}</strong></div>}
        </div>
      </header>

      <div className="detail-body">
        <div className="fin-strip">
          {finCards.map(card => (
            <div className="fin-card" key={card.label}>
              <span className="fin-card-label">{card.label}</span>
              <strong className="fin-card-value">{card.value}</strong>
              <div className={`fin-card-bar ${card.bar}`}/>
            </div>
          ))}
        </div>

        <div className="detail-pair detail-primary-pair">
          <section className="detail-card detail-contact-card">
            <h3>Contact</h3>
            <div className="detail-contact-columns">
              <div className="detail-contact-group">
                <h4>Mobile</h4>
                {lead.mobiles.map((item,index) => (
                  <div className="detail-contact-line" key={`${item.n}-${index}`}>
                    <span className="mono">{item.n}</span>
                    <PhoneActions number={item.n} onCall={() => onCall(item.n)} onMessage={() => onOpenMessages(item.n)} whatsapp/>
                  </div>
                ))}
              </div>
              <div className="detail-contact-group detail-landline-group">
                <h4>Landline</h4>
                {lead.landlines.length ? lead.landlines.map((item,index) => (
                  <div className="detail-contact-line" key={`${item.n}-${index}`}>
                    <span className="mono">{item.n}</span><PhoneActions number={item.n} onCall={() => onCall(item.n)}/>
                  </div>
                )) : <div className="detail-muted">None provided</div>}
              </div>
            </div>
            <div className="detail-contact-group detail-email-group">
              <h4>Email</h4>
              {lead.emails.map((item,index) => (
                <div className="detail-contact-line email" key={`${item.n}-${index}`}>
                  <span>{item.n}</span><span className="detail-quick-actions"><a href={`mailto:${item.n}`} title="Email" aria-label={`Email ${item.n}`}><Mail size={14} strokeWidth={1.9}/></a></span>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-card detail-company-card">
            <h3>Company</h3>
            <div className="detail-company-grid">
              {companyFields.map(([label,value]) => (
                <div className="detail-company-field" key={label}>
                  <span>{label}</span>
                  {label === 'Website' ? <a href={`https://${value}`} target="_blank" rel="noreferrer">{value}</a> : <strong>{value}</strong>}
                </div>
              ))}
              <div className="detail-company-field wide"><span>Address</span><strong>{lead.address}</strong></div>
            </div>
          </section>
        </div>

        <div className="detail-pair detail-finance-pair">
          <section className="detail-card detail-statements-card">
            <div className="detail-section-heading"><h3>Statements</h3><button type="button" onClick={() => setViewerDocIndex(latestDocIndex)} title="View latest statement" className="detail-pdf-button"><FileText size={18}/></button></div>
            <table className="detail-statement-table">
              <thead><tr><th>Month</th><th>Deposits</th><th>Ending</th></tr></thead>
              <tbody>
                {lead.stmts.slice(0,3).map((statement,index) => (
                  <tr key={`${statement.m}-${index}`} onClick={() => setViewerDocIndex(index)} title="Open statement"><td>{statement.m}</td><td className="mono">{formatFinancialUp(statement.dep)}</td><td className="mono">{formatFinancialUp(statement.end)}</td></tr>
                ))}
                {lead.mtd && <tr onClick={() => setViewerDocIndex(-1)} title="Open interim statement"><td>{lead.mtd.m.slice(0,3)} · MTD</td><td className="mono">{formatFinancialUp(lead.mtd.dep)}</td><td className="mono">{formatFinancialUp(lead.mtd.bal ?? lead.mtd.end)}</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="detail-card detail-bank-card">
            <h3>Bank Account</h3>
            <div className="detail-bank-rows">
              <div><span>Bank</span><strong>{lead.bank.name}</strong></div>
              <div><span>Account</span><strong className="mono">{lead.bank.acct}</strong></div>
              <div><span>Routing</span><strong className="mono">{lead.bank.routing}</strong></div>
              <div><span>Type</span><strong>{lead.bank.type}</strong></div>
              <div><span>Avg daily balance</span><strong className="mono">{formatFinancialUp(lead.bank.adb)}</strong></div>
              <div><span>Current balance</span><strong className="mono">{formatFinancialUp(lead.bank.bal)}</strong></div>
            </div>
          </section>
        </div>

        <section className="detail-pitch"><h3>Sales Pitch</h3><p>{generateSalesPitch(lead)}</p></section>
        <section className="detail-activity">
          <h3>Latest Activity</h3>
          <div>{lead.activity.slice(0,2).map((item,index) => {
            const { tone, Icon } = activityMeta(item.what);
            return (
              <div className="detail-activity-row" key={`${item.when}-${index}`}>
                <span className={`detail-activity-icon ${tone}`}><Icon size={12} strokeWidth={1.9}/></span>
                <div className="detail-activity-copy"><strong>{item.what}</strong><span>{item.when}</span></div>
              </div>
            );
          })}</div>
        </section>
      </div>
    </div>
  );
}
