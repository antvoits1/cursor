import type { CallEntry, Lead, SmsMessage } from '../data/types';

export interface ThreadSummary {
  leadId: string;
  name: string;
  time: string;
  preview: string;
}

export interface CommEvent {
  kind: 'messages' | 'calls' | 'email';
  leadId: string;
  name: string;
  time: string;
  preview: string;
}

export interface CallLogEntry extends CallEntry {
  id: string;
  leadId: string | null;
}

export function buildThreads(
  leads: Lead[],
  smsByLead: Record<string, SmsMessage[]>,
): ThreadSummary[] {
  return leads
    .filter((l) => (smsByLead[l.id] || []).length > 0)
    .map((l) => {
      const msgs = smsByLead[l.id];
      const last = msgs[msgs.length - 1];
      return { leadId: l.id, name: l.contact, time: last.time, preview: last.text };
    });
}

export function buildAllEvents(
  leads: Lead[],
  smsByLead: Record<string, SmsMessage[]>,
): CommEvent[] {
  const out: CommEvent[] = [];
  for (const l of leads) {
    const msgs = smsByLead[l.id] || [];
    const lastSms = msgs[msgs.length - 1];
    if (lastSms) {
      out.push({ kind: 'messages', leadId: l.id, name: l.contact, time: lastSms.time, preview: lastSms.text });
    }
    const firstCall = l.calls[0];
    if (firstCall) {
      out.push({
        kind: 'calls',
        leadId: l.id,
        name: firstCall.who,
        time: firstCall.when,
        preview: `${firstCall.dir === 'in' ? 'Incoming' : 'Outgoing'} · ${firstCall.duration}`,
      });
    }
    const firstMail = l.mails[0];
    if (firstMail) {
      out.push({ kind: 'email', leadId: l.id, name: l.contact, time: firstMail.when, preview: firstMail.subject });
    }
  }
  return out.slice(0, 18);
}

export function buildCallLog(leads: Lead[], sessionCalls: CallLogEntry[]): CallLogEntry[] {
  const fromLeads = leads.flatMap((l) =>
    l.calls.map((c, i) => ({ ...c, id: `${l.id}-${i}`, leadId: l.id as string | null })),
  );
  return [...sessionCalls, ...fromLeads].slice(0, 18);
}

export type ActivityIconName = 'mail' | 'call' | 'sms' | 'activity';

export function activityIcon(what: string): ActivityIconName {
  const t = what.toLowerCase();
  if (t.includes('email')) return 'mail';
  if (t.includes('call')) return 'call';
  if (t.includes('sms')) return 'sms';
  return 'activity';
}
