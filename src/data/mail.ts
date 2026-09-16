import { leads } from './leads';
import type { MailMessage } from './types';

const projectInbox: MailMessage[] = [
  {
    id: 'in1',
    folder: 'inbox',
    leadId: 'ns',
    from: 'Elijah Lance',
    to: 'Cole Brennan',
    subject: 'Re: Lance Truck & Auto Sales term sheet',
    time: 'Today 8:18 AM',
    preview: 'I reviewed it. Can we keep the payment closer to the number we discussed?',
    body: 'Cole,\n\nI reviewed it. Can we keep the payment closer to the number we discussed? I can jump on a call this morning.\n\nElijah',
    unread: true,
  },
  {
    id: 'in2',
    folder: 'inbox',
    leadId: 'hl',
    from: 'Marcus Chen',
    to: 'Cole Brennan',
    subject: 'Loss-runs',
    time: 'Yesterday 4:42 PM',
    preview: 'Alba sent the loss-runs. Please confirm you have them.',
    body: 'Cole,\n\nAlba sent the loss-runs. Please confirm you have them and let me know if credit needs anything else.\n\nMarcus',
    unread: false,
  },
  {
    id: 'in3',
    folder: 'inbox',
    leadId: 'bd',
    from: 'Dr. Priya Shah',
    to: 'Cole Brennan',
    subject: 'Funding timing',
    time: 'Yesterday 1:14 PM',
    preview: 'Signed. What time do you expect funding?',
    body: 'Cole,\n\nSigned. What time do you expect funding?\n\nPriya',
    unread: true,
  },
];

const sentMail: MailMessage[] = leads.flatMap((lead) =>
  lead.mails.map((m, i) => ({
    id: `sent-${lead.id}-${i}`,
    folder: 'sent' as const,
    leadId: lead.id,
    from: m.from,
    to: m.to,
    subject: m.subject,
    time: m.when,
    preview: m.preview,
    body: m.preview,
    unread: false,
  })),
);

const draftMail: MailMessage[] = [
  {
    id: 'draft1',
    folder: 'drafts',
    leadId: 'ns',
    from: 'Cole Brennan',
    to: 'elijah@lancetruckauto.com',
    subject: 'Lance Truck & Auto follow-up',
    time: 'Draft',
    preview: 'Elijah — following up on the payment structure...',
    body: 'Elijah — following up on the payment structure...',
    unread: false,
  },
];

export const initialMailbox: MailMessage[] = [...projectInbox, ...sentMail, ...draftMail];
