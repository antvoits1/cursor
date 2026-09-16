import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_DEVICE_ID, devices } from '../data/devices';
import { leads } from '../data/leads';
import { initialMailbox } from '../data/mail';
import type {
  CommTab,
  LeadFilter,
  MailFolder,
  MailMessage,
  SmsMessage,
} from '../data/types';
import type { CallLogEntry } from '../lib/comm';
import {
  dialDigits,
  formatDialInput,
  matchLeadByNameOrNumber,
  matchLeadByNumber,
} from '../lib/dialer';
import { formatClock } from '../lib/format';

export type CallStatus = 'idle' | 'dialing' | 'active';
export type ComposeMode = 'sms' | 'email' | null;

export interface DialerState {
  /** Raw digits the user entered (display formats them). */
  number: string;
  /** DTMF tones keyed while a call is active. */
  tones: string;
  status: CallStatus;
  muted: boolean;
  deviceId: string;
  keypadOpen: boolean;
  devicePopOpen: boolean;
}

interface CrmContextValue {
  // Leads
  selectedLeadId: string;
  filter: LeadFilter;
  selectLead: (id: string) => void;
  setFilter: (filter: LeadFilter) => void;

  // Communications
  commTab: CommTab;
  threadLeadId: string | null;
  openMailId: string | null;
  mailFolder: MailFolder;
  compose: ComposeMode;
  composeEmailTo: string;
  smsByLead: Record<string, SmsMessage[]>;
  mails: MailMessage[];
  sessionCalls: CallLogEntry[];
  setCommTab: (tab: CommTab) => void;
  openEvent: (kind: 'messages' | 'calls' | 'email', leadId: string) => void;
  openThread: (leadId: string) => void;
  closeThread: () => void;
  sendSms: (leadId: string, text: string) => void;
  startSmsCompose: () => void;
  sendComposedSms: (to: string, body: string) => void;
  openMail: (id: string) => void;
  closeMail: () => void;
  setMailFolder: (folder: MailFolder) => void;
  startEmailCompose: (prefillTo?: string) => void;
  sendEmail: (to: string, subject: string, body: string) => void;
  sendEmailReply: (mailId: string, text: string) => void;
  cancelCompose: () => void;

  // Cross-panel actions
  dialNumber: (number: string) => void;
  callNumber: (number: string) => void;
  messageLead: (leadId: string) => void;
  emailContact: (address: string) => void;

  // Dialer
  dialer: DialerState;
  connectedDeviceName: string;
  setDialNumber: (raw: string) => void;
  appendDialDigit: (digit: string) => void;
  backspaceDialDigit: () => void;
  startCall: () => void;
  markCallActive: () => void;
  endCall: (connectedSeconds: number) => void;
  toggleMute: () => void;
  toggleKeypad: () => void;
  toggleDevicePop: () => void;
  selectDevice: (id: string) => void;
}

const CrmContext = createContext<CrmContextValue | null>(null);

const initialSmsByLead: Record<string, SmsMessage[]> = Object.fromEntries(
  leads.map((l) => [l.id, l.sms]),
);

const initialDialer: DialerState = {
  number: '',
  tones: '',
  status: 'idle',
  muted: false,
  deviceId: DEFAULT_DEVICE_ID,
  keypadOpen: false,
  devicePopOpen: false,
};

export function CrmProvider({ children }: { children: ReactNode }) {
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0].id);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [commTab, setCommTabState] = useState<CommTab>('all');
  const [threadLeadId, setThreadLeadId] = useState<string | null>(null);
  const [openMailId, setOpenMailId] = useState<string | null>(null);
  const [mailFolder, setMailFolder] = useState<MailFolder>('inbox');
  const [compose, setCompose] = useState<ComposeMode>(null);
  const [composeEmailTo, setComposeEmailTo] = useState('');
  const [smsByLead, setSmsByLead] = useState(initialSmsByLead);
  const [mails, setMails] = useState<MailMessage[]>(initialMailbox);
  const [sessionCalls, setSessionCalls] = useState<CallLogEntry[]>([]);
  const [dialer, setDialer] = useState<DialerState>(initialDialer);

  const selectLead = useCallback((id: string) => setSelectedLeadId(id), []);

  const setCommTab = useCallback((tab: CommTab) => {
    setCommTabState(tab);
    setThreadLeadId(null);
    setOpenMailId(null);
    setCompose(null);
  }, []);

  const openEvent = useCallback(
    (kind: 'messages' | 'calls' | 'email', leadId: string) => {
      setSelectedLeadId(leadId);
      setCommTabState(kind);
      setCompose(null);
      setOpenMailId(null);
      setThreadLeadId(kind === 'messages' ? leadId : null);
    },
    [],
  );

  const openThread = useCallback((leadId: string) => setThreadLeadId(leadId), []);
  const closeThread = useCallback(() => setThreadLeadId(null), []);

  const sendSms = useCallback((leadId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const message: SmsMessage = {
      dir: 'out',
      channel: 'sms',
      number: lead.mobiles[0]?.number || '',
      time: 'Now',
      text: trimmed,
    };
    setSmsByLead((prev) => ({
      ...prev,
      [leadId]: [...(prev[leadId] || []), message],
    }));
  }, []);

  const startSmsCompose = useCallback(() => {
    setThreadLeadId(null);
    setCompose('sms');
  }, []);

  const sendComposedSms = useCallback((to: string, body: string) => {
    const text = body.trim();
    if (!to.trim() || !text) return;
    const lead = matchLeadByNameOrNumber(leads, to);
    setCompose(null);
    if (lead) {
      const message: SmsMessage = {
        dir: 'out',
        channel: 'sms',
        number: lead.mobiles[0]?.number || '',
        time: 'Now',
        text,
      };
      setSmsByLead((prev) => ({
        ...prev,
        [lead.id]: [...(prev[lead.id] || []), message],
      }));
      setSelectedLeadId(lead.id);
      setThreadLeadId(lead.id);
    }
  }, []);

  const openMail = useCallback((id: string) => {
    setOpenMailId(id);
    setMails((prev) => prev.map((m) => (m.id === id ? { ...m, unread: false } : m)));
  }, []);

  const closeMail = useCallback(() => setOpenMailId(null), []);

  const startEmailCompose = useCallback((prefillTo = '') => {
    setOpenMailId(null);
    setComposeEmailTo(prefillTo);
    setCompose('email');
  }, []);

  const sendEmail = useCallback((to: string, subject: string, body: string) => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    const lead = matchLeadByNameOrNumber(leads, to);
    const sent: MailMessage = {
      id: `sent-new-${Date.now()}`,
      folder: 'sent',
      leadId: lead?.id || '',
      from: 'Cole Brennan',
      to: to.trim(),
      subject: subject.trim(),
      time: 'Just now',
      preview: body.trim().slice(0, 90),
      body: body.trim(),
      unread: false,
    };
    setMails((prev) => [sent, ...prev]);
    setCompose(null);
    setComposeEmailTo('');
    setMailFolder('sent');
  }, []);

  const sendEmailReply = useCallback(
    (mailId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const original = mails.find((m) => m.id === mailId);
      if (!original) return;
      const counterpart = original.folder === 'sent' ? original.to : original.from;
      const sent: MailMessage = {
        id: `sent-reply-${Date.now()}`,
        folder: 'sent',
        leadId: original.leadId,
        from: 'Cole Brennan',
        to: counterpart,
        subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
        time: 'Just now',
        preview: trimmed.slice(0, 90),
        body: trimmed,
        unread: false,
      };
      setMails((prev) => [sent, ...prev]);
    },
    [mails],
  );

  const cancelCompose = useCallback(() => {
    setCompose(null);
    setComposeEmailTo('');
  }, []);

  // ── Dialer ──────────────────────────────────────────────────────────
  const setDialNumber = useCallback((raw: string) => {
    setDialer((d) => (d.status === 'idle' ? { ...d, number: dialDigits(raw).slice(0, 15) } : d));
  }, []);

  const appendDialDigit = useCallback((digit: string) => {
    setDialer((d) => {
      if (d.status === 'idle' && d.number.length < 15) return { ...d, number: d.number + digit };
      if (d.status === 'active') return { ...d, tones: d.tones + digit };
      return d;
    });
  }, []);

  const markCallActive = useCallback(() => {
    setDialer((d) => (d.status === 'dialing' ? { ...d, status: 'active' } : d));
  }, []);

  const backspaceDialDigit = useCallback(() => {
    setDialer((d) => (d.status === 'idle' ? { ...d, number: d.number.slice(0, -1) } : d));
  }, []);

  const startCall = useCallback(() => {
    setDialer((d) =>
      d.status === 'idle' && d.number.length >= 3
        ? { ...d, status: 'dialing', muted: false, keypadOpen: false, devicePopOpen: false }
        : d,
    );
  }, []);

  const endCall = useCallback(
    (connectedSeconds: number) => {
      setDialer((d) => {
        if (d.status === 'idle') return d;
        if (d.status === 'active' && connectedSeconds > 0) {
          const matched = matchLeadByNumber(leads, d.number);
          const deviceName = devices.find((dev) => dev.id === d.deviceId)?.name || 'Desk phone';
          const entry: CallLogEntry = {
            id: `session-${Date.now()}`,
            leadId: matched?.id || null,
            who: matched?.contact || formatDialInput(d.number),
            dir: 'out',
            duration: formatClock(connectedSeconds),
            when: 'Just now',
            device: deviceName,
            number: formatDialInput(d.number),
            note: 'Dialed from the topbar dialer',
          };
          setSessionCalls((prev) => [entry, ...prev].slice(0, 10));
        }
        return { ...d, status: 'idle', muted: false, keypadOpen: false, tones: '' };
      });
    },
    [],
  );

  const toggleMute = useCallback(() => {
    setDialer((d) => (d.status === 'idle' ? d : { ...d, muted: !d.muted }));
  }, []);

  const toggleKeypad = useCallback(() => {
    setDialer((d) => ({ ...d, keypadOpen: !d.keypadOpen, devicePopOpen: false }));
  }, []);

  const toggleDevicePop = useCallback(() => {
    setDialer((d) => ({ ...d, devicePopOpen: !d.devicePopOpen, keypadOpen: false }));
  }, []);

  const selectDevice = useCallback((id: string) => {
    setDialer((d) => ({ ...d, deviceId: id, devicePopOpen: false }));
  }, []);

  const dialNumber = useCallback((number: string) => {
    setDialer((d) => ({
      ...d,
      number: dialDigits(number).slice(0, 15),
      tones: '',
      status: 'idle',
      muted: false,
    }));
  }, []);

  const callNumber = useCallback((number: string) => {
    const digits = dialDigits(number).slice(0, 15);
    if (digits.length < 3) return;
    setDialer((d) => ({
      ...d,
      number: digits,
      tones: '',
      status: 'dialing',
      muted: false,
      keypadOpen: false,
      devicePopOpen: false,
    }));
  }, []);

  const messageLead = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
    setCommTabState('messages');
    setCompose(null);
    setOpenMailId(null);
    setThreadLeadId(leadId);
  }, []);

  const emailContact = useCallback((address: string) => {
    setCommTabState('email');
    setOpenMailId(null);
    setThreadLeadId(null);
    setComposeEmailTo(address);
    setCompose('email');
  }, []);

  const connectedDeviceName =
    devices.find((d) => d.id === dialer.deviceId)?.name || devices[0].name;

  const value = useMemo<CrmContextValue>(
    () => ({
      selectedLeadId,
      filter,
      selectLead,
      setFilter,
      commTab,
      threadLeadId,
      openMailId,
      mailFolder,
      compose,
      composeEmailTo,
      smsByLead,
      mails,
      sessionCalls,
      setCommTab,
      openEvent,
      openThread,
      closeThread,
      sendSms,
      startSmsCompose,
      sendComposedSms,
      openMail,
      closeMail,
      setMailFolder,
      startEmailCompose,
      sendEmail,
      sendEmailReply,
      cancelCompose,
      dialNumber,
      callNumber,
      messageLead,
      emailContact,
      dialer,
      connectedDeviceName,
      setDialNumber,
      appendDialDigit,
      backspaceDialDigit,
      startCall,
      markCallActive,
      endCall,
      toggleMute,
      toggleKeypad,
      toggleDevicePop,
      selectDevice,
    }),
    [
      selectedLeadId,
      filter,
      selectLead,
      commTab,
      threadLeadId,
      openMailId,
      mailFolder,
      compose,
      composeEmailTo,
      smsByLead,
      mails,
      sessionCalls,
      setCommTab,
      openEvent,
      openThread,
      closeThread,
      sendSms,
      startSmsCompose,
      sendComposedSms,
      openMail,
      closeMail,
      startEmailCompose,
      sendEmail,
      sendEmailReply,
      cancelCompose,
      dialNumber,
      callNumber,
      messageLead,
      emailContact,
      dialer,
      connectedDeviceName,
      setDialNumber,
      appendDialDigit,
      backspaceDialDigit,
      startCall,
      markCallActive,
      endCall,
      toggleMute,
      toggleKeypad,
      toggleDevicePop,
      selectDevice,
    ],
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm must be used inside CrmProvider');
  return ctx;
}
