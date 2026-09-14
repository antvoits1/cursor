import type { Lead } from '../data';
import { ageMinutes } from './comm';

export type NotificationKind = 'sms' | 'wa' | 'email' | 'call' | 'follow';

export interface CrmNotification {
  id: string;
  kind: NotificationKind;
  leadId: string;
  title: string;
  body: string;
  sub: string;
  when: string;
  number?: string;
  mailKey?: string;
  callKey?: string;
}

export const NOTIF_READ_KEY = 'forge-crm-notif-read-v16';
export const NOTIF_CAP = 12;

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function deriveNotifications(leads: Lead[]): CrmNotification[] {
  const rows: (CrmNotification & { age: number })[] = [];
  leads.forEach(lead => {
    (lead.sms || []).forEach((entry, index) => {
      if (entry.dir !== 'in') return;
      rows.push({
        id: `${lead.id}-sms-${index}`,
        kind: entry.ch === 'wa' ? 'wa' : 'sms',
        leadId: lead.id,
        title: lead.contact,
        body: entry.txt,
        sub: lead.company,
        when: entry.t,
        number: entry.n || lead.mobiles?.[0]?.n || '',
        age: ageMinutes(entry.t),
      });
    });
    (lead.mails || []).forEach((entry, index) => rows.push({
      id: `${lead.id}-mail-${index}`,
      kind: 'email',
      leadId: lead.id,
      title: entry.sub,
      body: entry.preview,
      sub: `${lead.contact} · ${lead.company}`,
      when: entry.when,
      mailKey: `${lead.id}-mail-${index}`,
      age: ageMinutes(entry.when),
    }));
    (lead.calls || []).forEach((entry, index) => rows.push({
      id: `${lead.id}-call-${index}`,
      kind: 'call',
      leadId: lead.id,
      title: entry.who || lead.contact,
      body: `${entry.dir === 'in' ? 'Incoming' : 'Outgoing'} · ${entry.dur}`,
      sub: lead.company,
      when: entry.when,
      callKey: `${lead.id}-call-${index}`,
      age: ageMinutes(entry.when),
    }));
    if (lead.follow) rows.push({
      id: `${lead.id}-follow`,
      kind: 'follow',
      leadId: lead.id,
      title: lead.contact,
      body: `Follow-up · ${shortDate(lead.follow)}`,
      sub: lead.company,
      when: shortDate(lead.follow),
      age: ageMinutes(lead.follow),
    });
  });
  return rows
    .sort((a, b) => a.age - b.age)
    .slice(0, NOTIF_CAP)
    .map(({ age, ...item }) => item);
}

export function loadReadIds(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(NOTIF_READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function saveReadIds(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...ids])); } catch { /* optional persistence */ }
}
