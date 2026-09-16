import type { Lead } from '../data/types';
import { money } from './format';

export interface ApplicationField {
  key: string;
  value: string;
  span?: 'wide' | 'full';
}

/**
 * One authoritative field list for the Application grid. Empty values are
 * skipped so every lead renders through the same layout.
 */
export function applicationFields(lead: Lead): ApplicationField[] {
  const sameAddress =
    !!lead.statementAddress && lead.statementAddress.trim() === lead.address.trim();
  const fields: Array<ApplicationField | null> = [
    { key: 'DBA', value: lead.dba },
    { key: 'Industry', value: lead.industry },
    { key: 'City', value: lead.city },
    { key: 'State', value: lead.incorporationState || '' },
    { key: 'Request', value: lead.ask ? money(lead.ask) : '' },
    { key: 'Offer', value: lead.offer ? money(lead.offer) : '' },
    { key: 'Position', value: lead.pos },
    { key: 'Rep', value: lead.rep },
    { key: 'Employees', value: lead.employees ? String(lead.employees) : '' },
    { key: 'BSD', value: lead.started },
    { key: 'Time in Biz', value: lead.tib },
    { key: 'Entity', value: lead.entity },
    { key: 'EIN', value: lead.ein },
    { key: 'SSN', value: lead.ssn },
    { key: 'DOB', value: lead.dob },
    { key: 'Revenue', value: lead.avg ? money(lead.avg) : '' },
    { key: 'Source', value: lead.source, span: 'wide' },
    { key: 'Use', value: lead.use, span: 'wide' },
    { key: 'Address', value: lead.address, span: 'wide' },
    sameAddress ? null : { key: 'Statement Address', value: lead.statementAddress, span: 'wide' },
    { key: 'Website', value: lead.website, span: 'wide' },
  ];
  return fields.filter((f): f is ApplicationField => f !== null && f.value !== '');
}
