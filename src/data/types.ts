export interface PhoneEntry {
  label: string;
  number: string;
}

export interface EmailEntry {
  label: string;
  address: string;
}

export interface BankInfo {
  name: string;
  account: string;
  routing: string;
  type: string;
  adb: number;
  balance: number;
}

export interface Statement {
  month: string;
  deposits: number;
  ending: number;
}

export interface MtdStatement {
  month: string;
  deposits: number;
  balance: number;
}

export interface McaPosition {
  who: string;
  funded: number;
  factor: number;
  daily: number;
  remaining: number;
  position: string;
  started: string;
  cadence: string;
}

export interface Expense {
  label: string;
  amount: number;
  cadence: string;
  note?: string;
}

export type MessageChannel = 'sms' | 'wa';
export type MessageDirection = 'in' | 'out';

export interface SmsMessage {
  dir: MessageDirection;
  channel: MessageChannel;
  number?: string;
  time: string;
  text: string;
}

export interface LeadMail {
  subject: string;
  from: string;
  to: string;
  when: string;
  preview: string;
}

export interface CallEntry {
  who: string;
  dir: MessageDirection;
  duration: string;
  when: string;
  device: string;
  number: string;
  note: string;
}

export interface ActivityEntry {
  when: string;
  what: string;
}

export interface Lead {
  id: string;
  company: string;
  dba: string;
  contact: string;
  title: string;
  industry: string;
  city: string;
  avg: number;
  ask: number;
  offer: number | null;
  pos: string;
  rep: string;
  source: string;
  employees: number;
  started: string;
  tib: string;
  entity: string;
  ein: string;
  ssn: string;
  dob: string;
  address: string;
  statementAddress: string;
  website: string;
  incorporationState?: string;
  lastAgo: string;
  mobiles: PhoneEntry[];
  landlines: PhoneEntry[];
  emails: EmailEntry[];
  bank: BankInfo;
  stmts: Statement[];
  mtd: MtdStatement;
  mca: McaPosition[];
  expenses: Expense[];
  sms: SmsMessage[];
  mails: LeadMail[];
  calls: CallEntry[];
  activity: ActivityEntry[];
  use: string;
  fav: boolean;
}

export type MailFolder = 'inbox' | 'sent' | 'drafts';

export interface MailMessage {
  id: string;
  folder: MailFolder;
  leadId: string;
  from: string;
  to: string;
  subject: string;
  time: string;
  preview: string;
  body: string;
  unread: boolean;
}

export interface Device {
  id: string;
  name: string;
}

export type LeadFilter = 'all' | 'starred' | 'hot';
export type CommTab = 'all' | 'messages' | 'calls' | 'contacts' | 'email';
