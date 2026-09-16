import type { Lead } from '../../data/types';
import { money } from '../../lib/format';
import { SectionTitle } from '../shared/SectionTitle';

export function FinancialSection({ lead }: { lead: Lead }) {
  const rows = lead.stmts.slice(0, 3);
  return (
    <div className="detail-section">
      <div className="bank-statement-grid">
        <div>
          <SectionTitle icon="pdf" accent="amber">
            Statements
          </SectionTitle>
          <table className="statement-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Deposits</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.month}>
                  <td>{s.month}</td>
                  <td>{money(s.deposits)}</td>
                  <td>{money(s.ending)}</td>
                </tr>
              ))}
              <tr>
                <td>{lead.mtd.month}</td>
                <td>{money(lead.mtd.deposits)}</td>
                <td>{money(lead.mtd.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <SectionTitle icon="bank" accent="blue">
            Bank
          </SectionTitle>
          <div className="info-list bank-list">
            <div className="info-line">
              <span className="info-label">Bank</span>
              <span className="info-value">{lead.bank.name}</span>
            </div>
            <div className="info-line">
              <span className="info-label">Account</span>
              <span className="info-value">{lead.bank.account}</span>
            </div>
            <div className="info-line">
              <span className="info-label">Routing</span>
              <span className="info-value">{lead.bank.routing}</span>
            </div>
            <div className="info-line">
              <span className="info-label">Type</span>
              <span className="info-value">{lead.bank.type}</span>
            </div>
            <div className="info-line">
              <span className="info-label">Avg daily</span>
              <span className="info-value">{money(lead.bank.adb)}</span>
            </div>
            <div className="info-line">
              <span className="info-label">Balance</span>
              <span className="info-value">{money(lead.bank.balance)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
