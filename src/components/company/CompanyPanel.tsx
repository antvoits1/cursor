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

export function CompanyPanel() {
  const { selectedLeadId } = useCrm();
  const lead = leads.find((l) => l.id === selectedLeadId) || leads[0];

  return (
    <section className="panel" id="detailPanel">
      <div className="detail-scroll">
        <div className="lead-profile">
          <div className="profile-line">
            <div className="profile-main">
              <div className="profile-company">{lead.company}</div>
              <div className="profile-owner">{lead.contact}</div>
            </div>
            <div className="profile-approval">
              <div className="profile-approval-label">Approval</div>
              <div className="profile-approval-value">{money(approval(lead))}</div>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <div className="split-top">
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
          <SectionTitle>Sales Pitch</SectionTitle>
          <div className="pitch">{salesPitch(lead)}</div>
        </div>

        <div className="detail-section">
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
    </section>
  );
}
