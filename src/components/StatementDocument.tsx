import { Lead } from '../data';

interface StatementDocumentProps {
  index: number;
  lead: Lead;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StatementDocument({ index, lead }: StatementDocumentProps) {
  if (index === -1 && !lead.mtd) return null;
  const data = index === -1 ? lead.mtd! : lead.stmts[index];
  if (!data) return null;

  const isMtd = index === -1;
  const title = isMtd ? 'INTERIM STATEMENT (MTD)' : 'STATEMENT OF ACCOUNT';
  const period = isMtd ? `${data.m} 1 - ${data.m} 15` : data.m;
  const monthLabel = data.m.split(' ')[0] || data.m;

  const endBal = data.bal ?? data.end;
  const deposits = data.dep;
  const withdrawals = Math.round(deposits * 0.8 * 100) / 100;
  const beginningBalance = Math.round((endBal - deposits + withdrawals) * 100) / 100;

  const depositOne = Math.round(deposits * 0.58 * 100) / 100;
  const depositTwo = Math.round((deposits - depositOne) * 100) / 100;
  const withdrawalOne = Math.round(withdrawals * 0.62 * 100) / 100;
  const withdrawalTwo = Math.round((withdrawals - withdrawalOne) * 100) / 100;

  const rows = [
    { date: `${monthLabel} 03`, description: 'ACH ELECTRONIC CREDIT - PROCESSOR SETTLEMENT', amount: depositOne },
    { date: `${monthLabel} 08`, description: 'ACH DEBIT - OPERATING EXPENSES', amount: -withdrawalOne },
    { date: `${monthLabel} 14`, description: 'ACH ELECTRONIC CREDIT - PROCESSOR SETTLEMENT', amount: depositTwo },
    { date: `${monthLabel} 21`, description: 'ACH DEBIT - PAYROLL / VENDORS', amount: -withdrawalTwo },
  ];

  let runningBalance = beginningBalance;
  const rowsWithBalance = rows.map(row => {
    runningBalance = Math.round((runningBalance + row.amount) * 100) / 100;
    return { ...row, balance: runningBalance };
  });

  return (
    <div className="stmt-doc">
      <div className="stmt-doc-head">
        <div className="stmt-doc-bank">
          <h1>{lead.bank.name}</h1>
          <div className="stmt-doc-muted">PO Box 1000, New York, NY 10001</div>
        </div>
        <div className="stmt-doc-title">
          <div className="stmt-doc-kicker">{title}</div>
          <div className="stmt-doc-muted">Page 1 of 1</div>
        </div>
      </div>

      <div className="stmt-doc-parties">
        <div className="stmt-doc-party">
          <div className="stmt-doc-company">{lead.company}</div>
          <div className="stmt-doc-address">{lead.address}</div>
        </div>
        <div className="stmt-doc-meta">
          <div><span>Account Number</span><strong>{lead.bank.acct}</strong></div>
          <div><span>Routing Number</span><strong>{lead.bank.routing}</strong></div>
          <div><span>Statement Period</span><strong>{period}</strong></div>
        </div>
      </div>

      <div className="stmt-doc-summary">
        <div className="stmt-doc-summary-head">Account Summary</div>
        <div className="stmt-doc-summary-grid">
          <div>
            <div className="stmt-doc-label">Beginning Balance</div>
            <div className="stmt-doc-figure">${money(beginningBalance)}</div>
          </div>
          <div>
            <div className="stmt-doc-label">Total Deposits</div>
            <div className="stmt-doc-figure credit">+${money(deposits)}</div>
          </div>
          <div>
            <div className="stmt-doc-label">Withdrawals</div>
            <div className="stmt-doc-figure debit">-${money(withdrawals)}</div>
          </div>
          <div className="stmt-doc-ending">
            <div className="stmt-doc-label">Ending Balance</div>
            <div className="stmt-doc-figure">${money(endBal)}</div>
          </div>
        </div>
      </div>

      <div className="stmt-doc-activity">
        <div className="stmt-doc-activity-head">Transaction Activity</div>
        <table className="stmt-doc-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithBalance.map((row, rowIndex) => (
              <tr key={`${row.date}-${rowIndex}`}>
                <td>{row.date}</td>
                <td>{row.description}</td>
                <td className={row.amount >= 0 ? 'credit' : 'debit'}>
                  {row.amount >= 0 ? '+' : '-'}${money(Math.abs(row.amount))}
                </td>
                <td className="stmt-doc-running">${money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
