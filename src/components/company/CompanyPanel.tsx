import { leads } from '../../data/leads';
import { activityIcon } from '../../lib/comm';
import { approval, money } from '../../lib/format';
import { salesPitch } from '../../lib/pitch';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';
import { SectionTitle } from '../shared/SectionTitle';
import { ApplicationGrid } from './ApplicationGrid';
import { ContactGrid } from './ContactGrid';
import { FinancialSection } from './FinancialSection';

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${accent ? ' accent' : ''}`}>{value}</div>
    </div>
  );
}

export function CompanyPanel() {
  const { selectedLeadId } = useCrm();
  const lead = leads.find((l) => l.id === selectedLeadId) || leads[0];
  const meta = [lead.industry, lead.city].filter(Boolean).join(' · ');

  return (
    <section className="panel" id="detailPanel">
      <div className="panel-head">
        <span className="panel-title">Company</span>
        {meta && <span className="panel-muted">{meta}</span>}
      </div>
      <div className="detail-scroll">
        <div className="lead-profile">
          <div className="profile-line">
            <div className="profile-main">
              <div className="profile-company">{lead.company}</div>
              <div className="profile-owner">
                {lead.contact}
                {lead.title ? ` · ${lead.title}` : ''}
              </div>
            </div>
          </div>
          <div className="stat-strip">
            <Stat label="Approval" value={money(approval(lead))} accent />
            <Stat label="Monthly Avg" value={money(lead.avg)} />
            <Stat label="Request" value={lead.ask ? money(lead.ask) : '—'} />
            <Stat label="Offer" value={lead.offer ? money(lead.offer) : '—'} />
          </div>
        </div>

        <div className="detail-section">
          <div className="split-2">
            <div className="box-compact">
              <SectionTitle icon="user" accent="blue">
                Contact
              </SectionTitle>
              <ContactGrid lead={lead} />
            </div>
            <div className="box-compact">
              <SectionTitle icon="brief" accent="green">
                Application
              </SectionTitle>
              <ApplicationGrid lead={lead} />
            </div>
          </div>
        </div>

        <FinancialSection lead={lead} />

        <div className="detail-section">
          <div className="split-2">
            <div className="box-compact">
              <SectionTitle>Sales Pitch</SectionTitle>
              <div className="pitch">{salesPitch(lead)}</div>
            </div>
            <div className="box-compact">
              <SectionTitle>Latest Activity</SectionTitle>
              {lead.activity.slice(0, 3).map((a) => (
                <div className="activity-line" key={`${a.when}-${a.what}`}>
                  <div className="activity-icon">
                    <Icon name={activityIcon(a.what)} size={12} />
                  </div>
                  <div>
                    <div className="activity-copy">{a.what}</div>
                    <div className="activity-time">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
