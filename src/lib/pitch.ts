import type { Lead } from '../data/types';
import { money } from './format';

export function salesPitch(lead: Lead): string {
  const stmt = lead.stmts[0];
  const pressure =
    lead.expenses[0]?.note ||
    `${lead.expenses[0]?.label || 'Operating expenses'} are the biggest recurring cash demand.`;
  const mca = lead.mca[0];
  const financing = mca
    ? `The existing ${mca.who} ${mca.cadence} payment is ${money(mca.daily)} and refinancing it could leave more daily working cash.`
    : `The file currently shows no listed MCA position, so the new capital can be focused on ${lead.use}.`;
  return `${lead.company} averages ${money(lead.avg)} per month and the latest completed statement shows ${money(stmt?.deposits || 0)} in deposits. ${pressure} ${financing}`;
}
