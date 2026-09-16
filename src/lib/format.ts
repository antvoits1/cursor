import { Lead } from '../data';

export function isLightColor(hex: string): boolean {
  const hexValue = hex.replace('#', '');
  const r = parseInt(hexValue.substr(0, 2), 16) || 0;
  const g = parseInt(hexValue.substr(2, 2), 16) || 0;
  const b = parseInt(hexValue.substr(4, 2), 16) || 0;
  return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) > 0.5;
}

export function generateSalesPitch(lead: Lead): string {
  const first = lead.contact.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, "").split(/\s+/)[0] || "there";
  const revenue = lead.avg ? `$${Math.round(lead.avg).toLocaleString('en-US')}` : "";
  const ask = lead.ask ? `$${lead.ask.toLocaleString()}` : 'the current request';
  const latestStmt = lead.stmts.length > 0 ? lead.stmts[0] : null;
  const approvalText = lead.offer
    ? `The file has a $${lead.offer.toLocaleString()} approval against a ${ask} request`
    : `The request is ${ask}, and no approval is on file yet`;

  return `${first}, ${lead.company} shows ${revenue} in monthly revenue and ${lead.tib} in business. ${approvalText}. The latest completed statement shows $${latestStmt?.dep.toLocaleString() || 0} in deposits with a $${latestStmt?.end.toLocaleString() || 0} ending balance. Keep the funding discussion centered on ${lead.use} while tying the terms to the numbers already on file.`;
}

export function formatMoneyWhole(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function formatAgo(agoStr: string): string {
  return agoStr
    .replace(' hours ago', 'h')
    .replace(' hour ago', 'h')
    .replace(' mins ago', 'm')
    .replace(' min ago', 'm')
    .replace(' days ago', 'd')
    .replace(' day ago', 'd')
    .replace(' weeks ago', 'w')
    .replace(' week ago', 'w')
    .replace(' ago', '');
}

export function formatFinancialUp(val: number): string {
  if (val < 0) return `-$${Math.abs(val).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
  if (val === 0) return '$0';
  let rounded = val;
  if (val > 100000) {
    rounded = Math.ceil(val / 50000) * 50000;
  } else if (val > 10000) {
    rounded = Math.ceil(val / 1000) * 1000;
  } else if (val > 1000) {
    rounded = Math.ceil(val / 500) * 500;
  } else {
    rounded = Math.ceil(val / 100) * 100;
  }
  return `$${rounded.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
}
