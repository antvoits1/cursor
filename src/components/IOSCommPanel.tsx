import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, Grid3x3, Mail, MessageCircle, MessageSquare, Phone, PhoneIncoming, PhoneOutgoing, Reply, Search, Send, SquarePen, Users } from 'lucide-react';
import type { Lead, CallEntry, MailEntry } from '../data';
import type { CommTab } from '../store';
import type { BridgeCall, BridgeContact, BridgeDevice, BridgeKind, BridgeMessage } from '../lib/bridge';
import { digitsOnly, newestByTime, oldestByTime, whatsappHref } from '../lib/comm';
import { DIAL_KEYS, playDtmf } from '../lib/dtmf';

export interface PendingCommOpen {
  tab: CommTab;
  leadId: string;
  emailKey?: string | null;
  callKey?: string | null;
}

interface Props {
  lead?: Lead;
  contacts?: Lead[];
  onBack?: () => void;
  preferredMobile?: string;
  defaultTab?: CommTab;
  openThreadOnLoad?: boolean;
  initialChannel?: 'sms' | 'wa';
  pendingOpen?: PendingCommOpen | null;
  onSelectLead?: (id: string) => void;
  onCall?: (number: string) => void;
  onPreferredMobileChange?: (number: string) => void;
  onSendSms?: (number: string, text: string) => Promise<boolean>;
  devices?: BridgeDevice[];
  selectedDeviceId?: string;
  onSelectDevice?: (id: string) => void;
  extractedMessages?: BridgeMessage[];
  extractedContacts?: BridgeContact[];
  extractedCalls?: BridgeCall[];
  bridgeKind?: BridgeKind;
}

function TypeIcon({ type, size = 14 }: { type: 'sms' | 'wa' | 'call' | 'email'; size?: number }) {
  if (type === 'call') return <Phone size={size} strokeWidth={1.75}/>;
  if (type === 'email') return <Mail size={size} strokeWidth={1.75}/>;
  if (type === 'wa') return <MessageCircle size={size} strokeWidth={1.75}/>;
  return <MessageSquare size={size} strokeWidth={1.75}/>;
}

function TabGlyph({ tab }: { tab: CommTab }) {
  if (tab === 'messages') return <MessageSquare size={16} strokeWidth={1.8}/>;
  if (tab === 'calls') return <Phone size={16} strokeWidth={1.8}/>;
  if (tab === 'contacts') return <Users size={16} strokeWidth={1.8}/>;
  if (tab === 'dialer') return <Grid3x3 size={16} strokeWidth={1.8}/>;
  return <Mail size={16} strokeWidth={1.8}/>;
}

function tabLabel(tab: CommTab): string {
  if (tab === 'calls') return 'Recents';
  if (tab === 'dialer') return 'Dialer';
  if (tab === 'email') return 'Mail';
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

function formatDial(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) return value;
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return value;
}

export default function IOSCommPanel({
  lead, contacts = [], onBack, preferredMobile, defaultTab = 'dialer', openThreadOnLoad = false,
  initialChannel = 'sms', pendingOpen = null, onSelectLead, onCall, onPreferredMobileChange, onSendSms,
  devices = [], selectedDeviceId = '', onSelectDevice, extractedMessages = [], extractedContacts = [],
  extractedCalls = [], bridgeKind = 'absent',
}: Props) {
  const pool = contacts.length ? contacts : (lead ? [lead] : []);
  const [activeTab, setActiveTab] = useState<CommTab>(defaultTab);
  const [messageLeadId, setMessageLeadId] = useState<string | null>(null);
  const [messageChannel, setMessageChannel] = useState<'sms' | 'wa'>('sms');
  const [messageText, setMessageText] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [openCall, setOpenCall] = useState<{ lead: Lead; entry: CallEntry; key: string } | null>(null);
  const [emailLeadId, setEmailLeadId] = useState<string | null>(null);
  const [openEmailKey, setOpenEmailKey] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [dialDigits, setDialDigits] = useState('');
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dialRef = useRef(dialDigits);
  dialRef.current = dialDigits;

  useEffect(() => {
    setActiveTab(defaultTab);
    setOpenContactId(null); setOpenCall(null); setEmailLeadId(null); setOpenEmailKey(null); setEmailSubject(''); setEmailBody('');
    if (!openThreadOnLoad) setMessageLeadId(null);
  }, [defaultTab, openThreadOnLoad]);
  useEffect(() => {
    if (openThreadOnLoad && defaultTab === 'messages' && lead?.id) {
      setMessageLeadId(lead.id);
      setMessageChannel(initialChannel);
    }
  }, [openThreadOnLoad, defaultTab, lead?.id, initialChannel]);

  const chooseLead = (item: Lead) => {
    onSelectLead?.(item.id);
    const mobile = item.mobiles?.[0]?.n || '';
    if (mobile) onPreferredMobileChange?.(mobile);
  };

  const messageConversations = useMemo(() => newestByTime(pool.filter(item => item.sms?.length), item => newestByTime(item.sms || [], msg => msg.t)[0]?.t || item.lastAgo), [pool]);
  const currentMessageLead = pool.find(item => item.id === messageLeadId) || null;
  const currentMobile = currentMessageLead
    ? ((preferredMobile && currentMessageLead.mobiles?.some(p => p.n === preferredMobile)) ? preferredMobile : (currentMessageLead.mobiles?.[0]?.n || ''))
    : (preferredMobile || lead?.mobiles?.[0]?.n || '');
  const threadMessages = useMemo(() => currentMessageLead ? oldestByTime(currentMessageLead.sms || [], msg => msg.t) : [], [currentMessageLead]);
  const callItems = useMemo(() => newestByTime(pool.flatMap(item => (item.calls || []).map((entry,index) => ({ key:`${item.id}-call-${index}`, lead:item, entry, when:entry.when }))), row => row.when), [pool]);
  const emailItems = useMemo(() => newestByTime(pool.flatMap(item => (item.mails || []).map((entry,index) => ({ key:`${item.id}-mail-${index}`, lead:item, entry, when:entry.when }))), row => row.when), [pool]);
  const contactBook = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return [...pool].filter(item => !q || `${item.contact} ${item.company} ${(item.mobiles||[]).map(p=>p.n).join(' ')} ${(item.emails||[]).map(p=>p.n).join(' ')}`.toLowerCase().includes(q)).sort((a,b) => a.contact.localeCompare(b.contact));
  }, [pool, contactSearch]);
  const groupedContacts = useMemo(() => {
    const groups = new Map<string,Lead[]>();
    contactBook.forEach(item => { const letter = item.contact.trim().charAt(0).toUpperCase() || '#'; groups.set(letter, [...(groups.get(letter) || []), item]); });
    return Array.from(groups.entries());
  }, [contactBook]);
  const phoneContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return extractedContacts.filter(item => !q || `${item.name} ${item.organization || ''} ${item.phones.join(' ')} ${item.emails.join(' ')}`.toLowerCase().includes(q));
  }, [extractedContacts, contactSearch]);

  const openContact = pool.find(item => item.id === openContactId) || null;
  const activeEmailLead = pool.find(item => item.id === emailLeadId) || lead || pool[0] || null;
  const activeEmail = openEmailKey ? emailItems.find(item => item.key === openEmailKey) : null;
  const inDrillDown = Boolean(
    (activeTab === 'messages' && currentMessageLead)
    || (activeTab === 'calls' && openCall)
    || (activeTab === 'contacts' && openContact)
    || (activeTab === 'email' && (openEmailKey || emailLeadId))
  );

  useEffect(() => {
    if (!pendingOpen) return;
    const target = pool.find(item => item.id === pendingOpen.leadId);
    if (!target) return;
    onSelectLead?.(target.id);
    setActiveTab(pendingOpen.tab);
    if (pendingOpen.tab === 'email') {
      const mailKey = pendingOpen.emailKey || null;
      const found = mailKey ? emailItems.find(row => row.key === mailKey) : null;
      setEmailLeadId(target.id);
      setOpenEmailKey(mailKey);
      setEmailSubject(found?.entry.sub || '');
      setEmailBody('');
      setEmailTo(target.emails?.[0]?.n || '');
    }
    if (pendingOpen.tab === 'calls') {
      const found = pendingOpen.callKey ? callItems.find(row => row.key === pendingOpen.callKey) : null;
      if (found) setOpenCall({ lead: target, entry: found.entry, key: found.key });
    }
  }, [pendingOpen]);
  useEffect(() => {
    if (openThreadOnLoad && currentMessageLead) composerRef.current?.focus();
  }, [currentMessageLead, openThreadOnLoad]);
  useEffect(() => {
    if (pendingOpen?.tab === 'email' && activeTab === 'email' && (openEmailKey || emailLeadId)) replyRef.current?.focus();
  }, [pendingOpen, activeTab, openEmailKey, emailLeadId]);
  useEffect(() => {
    if (activeEmailLead && !emailTo) setEmailTo(activeEmailLead.emails?.[0]?.n || '');
  }, [activeEmailLead?.id]);

  const openMessageThread = (item: Lead, channel: 'sms' | 'wa' = 'sms') => {
    chooseLead(item); setActiveTab('messages'); setMessageLeadId(item.id); setMessageChannel(channel); setMessageText('');
  };
  const sendMessage = async () => {
    const text = messageText.trim();
    if (!currentMobile || !text) return;
    if (messageChannel === 'wa') {
      window.open(whatsappHref(currentMobile, text), '_blank', 'noopener,noreferrer');
      return;
    }
    if (onSendSms) {
      const ok = await onSendSms(digitsOnly(currentMobile), text);
      if (ok) { setMessageText(''); return; }
    }
    window.location.href = `sms:${digitsOnly(currentMobile)}?body=${encodeURIComponent(text)}`;
  };
  const openEmailComposer = (item: Lead, mailKey: string | null = null, reply = false) => {
    const found = mailKey ? emailItems.find(row => row.key === mailKey) : null;
    chooseLead(item); setActiveTab('email'); setEmailLeadId(item.id); setOpenEmailKey(mailKey);
    const subject = found?.entry.sub || '';
    setEmailSubject(reply && subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : subject);
    setEmailTo(item.emails?.[0]?.n || '');
    setEmailBody(''); setTimeout(() => replyRef.current?.focus(), 0);
  };
  const sendEmail = () => {
    const email = emailTo || activeEmailLead?.emails?.[0]?.n || '';
    const body = emailBody.trim();
    if (!email || !body) return;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(emailSubject.trim())}&body=${encodeURIComponent(body)}`;
  };
  const changeTab = (tab: CommTab) => {
    setActiveTab(tab);
    if (tab === 'messages') setMessageLeadId(null);
    if (tab === 'calls') setOpenCall(null);
    if (tab === 'contacts') setOpenContactId(null);
    if (tab === 'email') { setEmailLeadId(null); setOpenEmailKey(null); setEmailSubject(''); setEmailBody(''); }
  };
  const appendDial = (digit: string) => {
    if (digit !== '+') playDtmf(digit);
    setDialDigits(current => `${current}${digit}`.slice(0, 16));
  };
  const placeDialCall = () => {
    const typed = digitsOnly(dialRef.current);
    const fallback = digitsOnly(currentMobile || lead?.mobiles?.[0]?.n || '');
    const number = typed || fallback;
    if (!number) return;
    onCall?.(number);
  };

  useEffect(() => {
    if (activeTab !== 'dialer' || inDrillDown) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const key = event.key;
      if (/^[0-9]$/.test(key) || key === '*' || key === '#') {
        event.preventDefault();
        appendDial(key);
      } else if (key === '+' ) {
        event.preventDefault();
        setDialDigits(current => current ? current : '+');
      } else if (key === 'Backspace') {
        event.preventDefault();
        setDialDigits(current => current.slice(0, -1));
      } else if (key === 'Enter') {
        event.preventDefault();
        placeDialCall();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, inDrillDown, currentMobile, lead?.id]);

  const displayTitle = activeTab === 'messages' && currentMessageLead ? currentMessageLead.contact
    : activeTab === 'contacts' && openContact ? openContact.contact
    : activeTab === 'calls' && openCall ? openCall.lead.contact
    : activeTab === 'email' && activeEmailLead && (openEmailKey || emailLeadId) ? activeEmailLead.contact
    : tabLabel(activeTab);

  return (
    <div className={`comm-panel${inDrillDown ? ' drill' : ''}`}>
      {devices.length > 0 && (
        <div className="link-device-row">
          {devices.map(device => (
            <button type="button" key={device.id} className={`${device.id === selectedDeviceId ? 'active' : ''}${device.connected ? ' live' : ''}`} onClick={() => onSelectDevice?.(device.id)}>
              <span>{device.name}</span>
            </button>
          ))}
        </div>
      )}
      <header className={`comm-head${inDrillDown ? ' compact' : ' large'}`}>
        <div className="comm-head-side">
          {onBack && <button type="button" onClick={onBack} className="comm-back"><ArrowLeft size={15}/> Back</button>}
          {inDrillDown && !onBack && activeTab === 'messages' && <button type="button" className="comm-contact-back" onClick={() => setMessageLeadId(null)}><ArrowLeft size={16}/> Messages</button>}
          {inDrillDown && activeTab === 'calls' && <button type="button" className="comm-contact-back" onClick={() => setOpenCall(null)}><ArrowLeft size={16}/> Recents</button>}
          {inDrillDown && activeTab === 'contacts' && <button type="button" className="comm-contact-back" onClick={() => setOpenContactId(null)}><ArrowLeft size={16}/> Contacts</button>}
          {inDrillDown && activeTab === 'email' && <button type="button" className="comm-contact-back" onClick={() => { setOpenEmailKey(null); setEmailLeadId(null); setEmailSubject(''); setEmailBody(''); }}><ArrowLeft size={16}/> Mail</button>}
        </div>
        <div className="comm-head-title"><strong>{displayTitle}</strong>{!inDrillDown && lead?.company && activeTab !== 'dialer' && <span>{lead.company}</span>}</div>
        <div className="comm-head-side end">
          {activeTab === 'email' && <button type="button" className="comm-icon-button" title="Compose email" onClick={() => lead && openEmailComposer(lead)}><SquarePen size={16}/></button>}
          {activeTab === 'email' && activeEmail && <button type="button" className="comm-small-action" onClick={() => openEmailComposer(activeEmail.lead,activeEmail.key,true)} title="Reply"><Reply size={14}/></button>}
        </div>
      </header>

      <div className="comm-scroll">
        {activeTab === 'dialer' && (
          <div className="dial-view">
            <div className="dial-status">{bridgeKind === 'synced' ? 'Ready on the selected Bluetooth phone' : 'Call hands off to a connected phone or Windows bridge'}</div>
            <div className="dial-number">{dialDigits ? formatDial(dialDigits) : (lead?.mobiles?.[0]?.n || 'Enter a number')}</div>
            {lead?.contact && <div className="dial-hint">{dialDigits ? 'Enter places the call' : `Empty call uses ${lead.contact}`}</div>}
            <div className="dial-pad">
              {DIAL_KEYS.map(([digit, letters]) => (
                <button type="button" key={digit} className="dial-key" onClick={() => appendDial(digit === '0' && dialDigits === '' ? '0' : digit)}>
                  <b>{digit}</b>
                  {letters ? <s>{letters}</s> : <s>&nbsp;</s>}
                </button>
              ))}
            </div>
            <div className="dial-actions">
              <button type="button" className="dial-clear" onClick={() => setDialDigits(current => current.slice(0, -1))} disabled={!dialDigits} title="Delete">⌫</button>
              <button type="button" className="dial-call" onClick={placeDialCall} title="Call"><Phone size={18} strokeWidth={2}/></button>
              <button type="button" className="dial-plus" onClick={() => setDialDigits(current => current.startsWith('+') ? current : `+${current}`)} title="Plus">+</button>
            </div>
          </div>
        )}

        {activeTab === 'messages' && !currentMessageLead && (
          <div className="comm-list">
            {extractedMessages.length > 0 && (
              <>
                <div className="comm-list-label">From the connected phone</div>
                {extractedMessages.slice(0, 20).map((item, index) => (
                  <div className="comm-row static" key={`${item.deviceId}-${item.handle || index}`}>
                    <span className="comm-type-icon sms"><TypeIcon type="sms"/></span>
                    <span className="comm-row-copy">
                      <span className="comm-row-top"><strong>{item.from || item.to || item.deviceName || 'Phone'}</strong><time>{item.date || ''}</time></span>
                      <span className="comm-row-sub">{item.deviceName || item.folder || 'MAP'}</span>
                      <span className="comm-row-detail">{item.preview || item.body || item.subject || ''}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            <div className="comm-list-label">Lead conversations</div>
            {!messageConversations.length && <div className="comm-empty">No message threads found.</div>}
            {messageConversations.map(item => {
              const latest = newestByTime(item.sms || [], msg => msg.t)[0];
              const type = latest?.ch === 'wa' ? 'wa' : 'sms';
              return (
                <button type="button" className="comm-row" key={item.id} onClick={() => openMessageThread(item,type)}>
                  <span className={`comm-type-icon ${type}`}><TypeIcon type={type}/></span>
                  <span className="comm-row-copy">
                    <span className="comm-row-top"><strong>{item.contact}</strong><time>{latest?.t || item.lastAgo}</time></span>
                    <span className="comm-row-sub">{item.company}</span>
                    <span className="comm-row-detail">{latest?.txt || 'No messages'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'messages' && currentMessageLead && (
          <div className="comm-thread-view">
            <div className="comm-thread-toolbar">
              <span className="comm-thread-channel"><TypeIcon type={messageChannel}/>{messageChannel === 'wa' ? 'WhatsApp' : 'SMS'}</span>
            </div>
            <div className="comm-thread">
              {threadMessages.map((msg,index) => {
                const mine = msg.dir === 'out';
                const type = msg.ch === 'wa' ? 'wa' : 'sms';
                return (
                  <div className="comm-bubble-wrap" key={`${msg.t}-${index}`}>
                    <div className={`comm-bubble ${mine ? 'out' : 'in'}`}>
                      <span className="comm-bubble-channel"><TypeIcon type={type} size={10}/></span>
                      <span>{msg.txt}</span>
                      <span className="comm-bubble-meta"><time>{msg.t}</time>{mine && <CheckCheck size={12} strokeWidth={2.5}/>}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'calls' && !openCall && (
          <div className="comm-list">
            {extractedCalls.length > 0 && (
              <>
                <div className="comm-list-label">From the connected phone</div>
                {extractedCalls.slice(0, 20).map((item, index) => (
                  <div className="comm-row static" key={`${item.deviceId}-${item.number}-${index}`}>
                    <span className="comm-type-icon call"><Phone size={14}/></span>
                    <span className="comm-row-copy">
                      <span className="comm-row-top"><strong>{item.name || item.number || 'Unknown'}</strong><time>{item.when || ''}</time></span>
                      <span className="comm-row-detail">{item.direction || 'call'} · {item.number || ''}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            <div className="comm-list-label">Lead recents</div>
            {!callItems.length && <div className="comm-empty">No calls on file.</div>}
            {callItems.map(row => (
              <button type="button" className="comm-row" key={row.key} onClick={() => { chooseLead(row.lead); setOpenCall(row); }}>
                <span className="comm-type-icon call">{row.entry.dir === 'out' ? <PhoneOutgoing size={14}/> : <PhoneIncoming size={14}/>}</span>
                <span className="comm-row-copy">
                  <span className="comm-row-top"><strong>{row.entry.who || row.lead.contact}</strong><time>{row.when}</time></span>
                  <span className="comm-row-sub">{row.lead.company}</span>
                  <span className="comm-row-detail">{row.entry.n} · {row.entry.dur}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {activeTab === 'calls' && openCall && (
          <div className="comm-detail-view">
            <div className="comm-detail-card">
              <span className="comm-detail-kicker">{openCall.entry.dir === 'in' ? 'Incoming' : 'Outgoing'} call</span>
              <strong>{openCall.entry.who || openCall.lead.contact}</strong>
              <span>{openCall.lead.company}</span>
              <div className="comm-detail-meta">
                <b>{openCall.entry.n}</b>
                <span>{openCall.entry.when}</span>
                <span>{openCall.entry.dur}</span>
              </div>
              {openCall.entry.note && <p>{openCall.entry.note}</p>}
              <div className="comm-detail-actions">
                <button type="button" onClick={() => onCall?.(openCall.entry.n)} title="Call"><Phone size={14}/></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && !openContact && (
          <div className="comm-contacts">
            <label className="comm-search"><Search size={14}/><input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search contacts"/></label>
            <div className="comm-contact-book">
              {phoneContacts.length > 0 && (
                <div className="comm-contact-group">
                  <div className="comm-contact-letter">On phone</div>
                  {phoneContacts.map(item => (
                    <div className="comm-contact-row static" key={`${item.deviceId}-${item.name}`}>
                      <span><strong>{item.name}</strong><small>{item.organization || item.deviceName || 'PBAP'}</small></span>
                      <em>{item.phones[0] || item.emails[0] || ''}</em>
                    </div>
                  ))}
                </div>
              )}
              {groupedContacts.map(([letter,items]) => (
                <div className="comm-contact-group" key={letter}>
                  <div className="comm-contact-letter">{letter}</div>
                  {items.map(item => (
                    <button type="button" className="comm-contact-row" key={item.id} onClick={() => { chooseLead(item); setOpenContactId(item.id); }}>
                      <span><strong>{item.contact}</strong><small>{item.company}</small></span>
                      <em>{item.mobiles?.[0]?.n || item.emails?.[0]?.n || ''}</em>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'contacts' && openContact && (
          <div className="comm-contact-detail">
            <div className="comm-contact-detail-head">
              <strong>{openContact.contact}</strong>
              <span>{openContact.company}</span>
              <div className="comm-contact-actions">
                {openContact.mobiles?.[0]?.n && (
                  <>
                    <button type="button" onClick={() => onCall?.(openContact.mobiles[0].n)} title="Call"><Phone size={14}/></button>
                    <button type="button" onClick={() => openMessageThread(openContact,'sms')} title="SMS"><MessageSquare size={14}/></button>
                    <a href={whatsappHref(openContact.mobiles[0].n)} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={14}/></a>
                  </>
                )}
                {openContact.emails?.[0]?.n && <a href={`mailto:${openContact.emails[0].n}`} title="Email"><Mail size={14}/></a>}
              </div>
            </div>
            <div className="comm-contact-detail-list">
              {openContact.mobiles.map((phone,index) => (
                <div className="comm-contact-detail-row" key={`${phone.n}-${index}`}>
                  <span><small>{phone.l}</small><strong>{phone.n}</strong></span>
                  <div className="comm-mini-actions">
                    <button type="button" onClick={() => onCall?.(phone.n)}><Phone size={13}/></button>
                    <button type="button" onClick={() => { onPreferredMobileChange?.(phone.n); openMessageThread(openContact,'sms'); }}><MessageSquare size={13}/></button>
                    <a href={whatsappHref(phone.n)} target="_blank" rel="noreferrer"><MessageCircle size={13}/></a>
                  </div>
                </div>
              ))}
              {openContact.landlines.map((phone,index) => (
                <div className="comm-contact-detail-row" key={`${phone.n}-${index}`}>
                  <span><small>{phone.l}</small><strong>{phone.n}</strong></span>
                  <div className="comm-mini-actions">
                    <button type="button" onClick={() => onCall?.(phone.n)}><Phone size={13}/></button>
                  </div>
                </div>
              ))}
              {openContact.emails.map((email,index) => (
                <div className="comm-contact-detail-row" key={`${email.n}-${index}`}>
                  <span><small>{email.l}</small><strong>{email.n}</strong></span>
                  <div className="comm-mini-actions">
                    <a href={`mailto:${email.n}`}><Mail size={13}/></a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'email' && !(openEmailKey || emailLeadId) && (
          <div className="comm-list">
            <div className="comm-list-label comm-list-label-row">
              <span>Mail</span>
              {lead && <button type="button" className="comm-small-action" onClick={() => openEmailComposer(lead)} title="Compose email"><SquarePen size={14}/></button>}
            </div>
            {!emailItems.length && <div className="comm-empty">No email history on file.</div>}
            {emailItems.map(row => (
              <button type="button" className="comm-row" key={row.key} onClick={() => openEmailComposer(row.lead,row.key,false)}>
                <span className="comm-type-icon email"><Mail size={14}/></span>
                <span className="comm-row-copy">
                  <span className="comm-row-top"><strong>{row.entry.sub}</strong><time>{row.when}</time></span>
                  <span className="comm-row-sub">{row.lead.contact} · {row.lead.company}</span>
                  <span className="comm-row-detail">{row.entry.preview}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {activeTab === 'email' && (openEmailKey || emailLeadId) && (
          <div className="comm-email-view">
            {activeEmail && (
              <article className="comm-email-open">
                <div className="comm-email-meta"><strong>{activeEmail.entry.from}</strong><time>{activeEmail.entry.when}</time></div>
                <h3>{activeEmail.entry.sub}</h3>
                <p>{activeEmail.entry.preview}</p>
              </article>
            )}
            {!activeEmail && <div className="comm-email-new-label">New email to {activeEmailLead?.contact || ''}</div>}
          </div>
        )}
      </div>

      {activeTab === 'messages' && currentMessageLead && (
        <div className="comm-composer">
          <button type="button" className="comm-channel-toggle" onClick={() => setMessageChannel(c => c === 'sms' ? 'wa' : 'sms')} title="Switch channel"><TypeIcon type={messageChannel}/></button>
          <textarea ref={composerRef} value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder={messageChannel === 'wa' ? 'WhatsApp message' : 'Message'} rows={1}/>
          <button type="button" onClick={() => { void sendMessage(); }} disabled={!messageText.trim() || !currentMobile} title="Send" className="comm-send"><Send size={15}/></button>
        </div>
      )}
      {activeTab === 'email' && (openEmailKey || emailLeadId) && (
        <div className="comm-email-compose">
          <label className="comm-email-subject">
            <span>To</span>
            {(activeEmailLead?.emails.length || 0) > 1 ? (
              <select value={emailTo} onChange={e => setEmailTo(e.target.value)}>
                {activeEmailLead?.emails.map(item => <option key={item.n} value={item.n}>{item.n}</option>)}
              </select>
            ) : <strong>{emailTo || activeEmailLead?.emails?.[0]?.n || 'No email'}</strong>}
          </label>
          <label className="comm-email-subject"><span>Subject</span><input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject"/></label>
          <textarea ref={replyRef} value={emailBody} onChange={e => setEmailBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && emailBody.trim()) { e.preventDefault(); sendEmail(); } }} placeholder={activeEmail ? 'Reply…' : 'Write email…'}/>
          <div className="comm-email-actions">
            <span className="comm-email-from">sales@forgecrm.com · Enter sends</span>
            <button type="button" onClick={sendEmail} disabled={!emailBody.trim() || !(emailTo || activeEmailLead?.emails?.[0]?.n)} className="comm-send"><Send size={14}/></button>
          </div>
        </div>
      )}

      {!inDrillDown && (
        <div className="comm-tab-wrap">
          <nav className="comm-tabs">
            {(['messages','calls','contacts','dialer','email'] as CommTab[]).map(tab => (
              <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => changeTab(tab)}>
                <TabGlyph tab={tab}/>
                {tabLabel(tab)}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
