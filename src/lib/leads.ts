import { HOT_LEAD_IDS } from '../data/leads';
import type { Lead, LeadFilter } from '../data/types';

export function filterLeads(leads: Lead[], filter: LeadFilter, query = ''): Lead[] {
  let out = leads;
  if (filter === 'starred') out = out.filter((l) => l.fav);
  if (filter === 'hot') out = out.filter((l) => HOT_LEAD_IDS.has(l.id));
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (l) => l.company.toLowerCase().includes(q) || l.contact.toLowerCase().includes(q),
    );
  }
  return out;
}
