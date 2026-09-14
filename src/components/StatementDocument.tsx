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
    <div className="w-full h-full bg-white text-slate-900 p-8 flex flex-col text-[calc(12px+var(--font-offset))] font-sans leading-relaxed relative overflow-hidden box-border">
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-5 mb-5 gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-sans text-slate-900 tracking-tight truncate">{lead.bank.name}</h1>
          <div className="text-slate-500 mt-1">PO Box 1000, New York, NY 10001</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-base font-bold tracking-widest text-slate-900">{title}</div>
          <div className="text-slate-500 mt-1">Page 1 of 1</div>
        </div>
      </div>

      <div className="flex justify-between mb-6 gap-8">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 uppercase truncate">{lead.company}</div>
          <div className="uppercase text-[11px] leading-snug">{lead.address}</div>
        </div>
        <div className="text-right flex-shrink-0 text-[11px]">
          <div className="mb-1"><span className="text-slate-500 mr-3">Account Number</span><span className="font-bold">{lead.bank.acct}</span></div>
          <div className="mb-1"><span className="text-slate-500 mr-3">Routing Number</span><span className="font-bold">{lead.bank.routing}</span></div>
          <div><span className="text-slate-500 mr-3">Statement Period</span><span className="font-bold">{period}</span></div>
        </div>
      </div>

      <div className="border border-slate-300 rounded-lg overflow-hidden mb-6">
        <div className="bg-slate-100 px-5 py-1.5 font-bold font-sans text-xs text-slate-900 border-b border-slate-300">Account Summary</div>
        <div className="grid grid-cols-4 divide-x divide-slate-200">
          <div className="p-3 text-center">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Beginning Balance</div>
            <div className="text-sm font-bold">${money(beginningBalance)}</div>
          </div>
          <div className="p-3 text-center">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Total Deposits</div>
            <div className="text-sm font-bold text-green-700">+${money(deposits)}</div>
          </div>
          <div className="p-3 text-center">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Withdrawals</div>
            <div className="text-sm font-bold text-red-600">-${money(withdrawals)}</div>
          </div>
          <div className="p-3 text-center bg-slate-50">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Ending Balance</div>
            <div className="text-sm font-bold">${money(endBal)}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="font-bold font-sans text-xs text-slate-900 border-b-2 border-slate-300 pb-1.5 mb-2">Transaction Activity</div>
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr className="text-[9px] text-slate-500 uppercase tracking-widest border-b border-slate-200">
              <th className="pb-1.5 font-normal w-20">Date</th>
              <th className="pb-1.5 font-normal">Description</th>
              <th className="pb-1.5 font-normal text-right">Amount</th>
              <th className="pb-1.5 font-normal text-right w-28">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rowsWithBalance.map((row, rowIndex) => (
              <tr key={`${row.date}-${rowIndex}`}>
                <td className="py-2">{row.date}</td>
                <td className="py-2">{row.description}</td>
                <td className={`py-2 text-right ${row.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {row.amount >= 0 ? '+' : '-'}${money(Math.abs(row.amount))}
                </td>
                <td className="py-2 text-right text-slate-400">${money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
