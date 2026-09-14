import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Mail, MessageCircle, MessageSquareText, Phone, PhoneIncoming, PhoneOutgoing, Reply, Search, Send, SquarePen } from 'lucide-react';
import type { Lead, CallEntry, MailEntry } from '../data';
import type { CommTab } from '../store';
import { digitsOnly, newestByTime, oldestByTime, whatsappHref } from '../lib/comm';

export interface PendingCommOpen {
  tab: CommTab;
  leadId: string;
  emailKey?: string | null;
  callKey?: string | null;
  nonce: number;
}

interface Props {
  lead?: Lead;
  contacts?: Lead[];
  onBack?: () => void;
  fullWidth?: boolean;
  preferredMobile?: string;
  defaultTab?: CommTab;
  openThreadOnLoad?: boolean;
  pendingOpen?: PendingCommOpen | null;
  onSelectLead?: (id: string) => void;
  onCall?: (number: string) => void;
  onPreferredMobileChange?: (number: string) => void;
}

type AllRow = {
  key: string;
  lead: Lead;
  type: 'sms' | 'wa' | 'call' | 'email';
  title: string;
  detail: string;
  when: string;
  entry?: CallEntry | MailEntry;
};

function TypeIcon({ type, size = 14 }: { type: AllRow['type']; size?: number }) {
  if (type === 'call') return <Phone size={size} strokeWidth={1.75}/>;
  if (type === 'email') return <Mail size={size} strokeWidth={1.75}/>;
  if (type === 'wa') return <MessageCircle size={size} strokeWidth={1.75}/>;
  return <MessageSquareText size={size} strokeWidth={1.75}/>;
}

export default function IOSCommPanel({
  lead, contacts = [], onBack, fullWidth = false, preferredMobile, defaultTab = 'all', openThreadOnLoad = false,
  pendingOpen = null, onSelectLead, onCall, onPreferredMobileChange,
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
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setActiveTab(defaultTab);
    setOpenContactId(null); setOpenCall(null); setEmailLeadId(null); setOpenEmailKey(null); setEmailSubject(''); setEmailBody('');
    if (!openThreadOnLoad) setMessageLeadId(null);
  }, [defaultTab, openThreadOnLoad]);
  useEffect(() => {
    if (openThreadOnLoad && defaultTab === 'messages' && lead?.id) {
      setMessageLeadId(lead.id);
      setTimeout(() => composerRef.current?.focus(), 0);
    }
  }, [openThreadOnLoad, defaultTab, lead?.id]);

  const chooseLead = (item: Lead) => {
    onSelectLead?.(item.id);
    const mobile = item.mobiles?.[0]?.n || '';
    if (mobile) onPreferredMobileChange?.(mobile);
  };

  const messageConversations = useMemo(() => newestByTime(pool.filter(item => item.sms?.length), item => newestByTime(item.sms || [], msg => msg.t)[0]?.t || item.lastAgo), [pool]);
  const currentMessageLead = pool.find(item => item.id === messageLeadId) || null;
  const currentMobile = currentMessageLead
    ? ((preferredMobile && currentMessageLead.mobiles?.some(p => p.n === preferredMobile)) ? preferredMobile : (currentMessageLead.mobiles?.[0]?.n || ''))
    : '';
  const threadMessages = useMemo(() => currentMessageLead ? oldestByTime(currentMessageLead.sms || [], msg => msg.t) : [], [currentMessageLead]);

  const allItems = useMemo<AllRow[]>(() => {
    const rows: AllRow[] = [];
    pool.forEach(item => {
      (item.sms || []).forEach((entry,index) => rows.push({ key:`${item.id}-sms-${index}`, lead:item, type:entry.ch === 'wa' ? 'wa' : 'sms', title:item.contact, detail:entry.txt, when:entry.t }));
      (item.calls || []).forEach((entry,index) => rows.push({ key:`${item.id}-call-${index}`, lead:item, type:'call', title:entry.who || item.contact, detail:`${entry.dir === 'in' ? 'Incoming' : 'Outgoing'} · ${entry.dur}`, when:entry.when, entry }));
      (item.mails || []).forEach((entry,index) => rows.push({ key:`${item.id}-mail-${index}`, lead:item, type:'email', title:entry.sub, detail:entry.preview, when:entry.when, entry }));
    });
    return newestByTime(rows, row => row.when).slice(0,40);
  }, [pool]);
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

  const openContact = pool.find(item => item.id === openContactId) || null;
  const activeEmailLead = pool.find(item => item.id === emailLeadId) || lead || pool[0] || null;
  const activeEmail = openEmailKey ? emailItems.find(item => item.key === openEmailKey) : null;

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
      setTimeout(() => replyRef.current?.focus(), 0);
    }
    if (pendingOpen.tab === 'calls') {
      const found = pendingOpen.callKey ? callItems.find(row => row.key === pendingOpen.callKey) : null;
      if (found) setOpenCall({ lead: target, entry: found.entry, key: found.key });
    }
  }, [pendingOpen]);

  const openMessageThread = (item: Lead, channel: 'sms' | 'wa' = 'sms') => {
    chooseLead(item); setActiveTab('messages'); setMessageLeadId(item.id); setMessageChannel(channel); setMessageText('');
  };
  const sendMessage = () => {
    const text = messageText.trim();
    if (!currentMobile || !text) return;
    if (messageChannel === 'wa') window.open(whatsappHref(currentMobile, text), '_blank', 'noopener,noreferrer');
    else window.location.href = `sms:${digitsOnly(currentMobile)}?body=${encodeURIComponent(text)}`;
  };
  const openEmailComposer = (item: Lead, mailKey: string | null = null, reply = false) => {
    const found = mailKey ? emailItems.find(row => row.key === mailKey) : null;
    chooseLead(item); setActiveTab('email'); setEmailLeadId(item.id); setOpenEmailKey(mailKey);
    const subject = found?.entry.sub || '';
    setEmailSubject(reply && subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : subject);
    setEmailBody(''); setTimeout(() => replyRef.current?.focus(), 0);
  };
  const sendEmail = () => {
    const email = activeEmailLead?.emails?.[0]?.n || '';
    const body = emailBody.trim();
    if (!email || !body) return;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(emailSubject.trim())}&body=${encodeURIComponent(body)}`;
  };
  const openAllItem = (item: AllRow) => {
    chooseLead(item.lead);
    if (item.type === 'sms' || item.type === 'wa') openMessageThread(item.lead, item.type);
    else if (item.type === 'call' && item.entry) { setActiveTab('calls'); setOpenCall({ lead:item.lead, entry:item.entry as CallEntry, key:item.key }); }
    else openEmailComposer(item.lead, item.key, false);
  };
  const changeTab = (tab: CommTab) => {
    setActiveTab(tab);
    if (tab === 'messages') setMessageLeadId(null);
    if (tab === 'calls') setOpenCall(null);
    if (tab === 'contacts') setOpenContactId(null);
    if (tab === 'email') { setEmailLeadId(null); setOpenEmailKey(null); setEmailSubject(''); setEmailBody(''); }
  };

  const displayTitle = activeTab === 'messages' && currentMessageLead ? currentMessageLead.contact
    : activeTab === 'contacts' && openContact ? openContact.contact
    : activeTab === 'calls' && openCall ? openCall.lead.contact
    : activeTab === 'email' && activeEmailLead && (openEmailKey || emailLeadId) ? activeEmailLead.contact
    : activeTab === 'all' ? (lead?.contact || 'Communications')
    : activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

  return (
    <div className={`comm-panel ${fullWidth ? 'full' : ''}`}>
      <header className="comm-head">
        <div className="comm-head-side">{onBack && <button type="button" onClick={onBack} className="comm-back"><ArrowLeft size={15}/> Back</button>}</div>
        <div className="comm-head-title"><strong>{displayTitle}</strong>{activeTab === 'all' && lead?.company && <span>{lead.company}</span>}</div>
        <div className="comm-head-side end">{activeTab === 'email' && <button type="button" className="comm-icon-button" title="Compose email" onClick={() => lead && openEmailComposer(lead)}><SquarePen size={16}/></button>}</div>
      </header>

      <div className="comm-tab-wrap"><nav className="comm-tabs">{(['all','messages','calls','contacts','email'] as CommTab[]).map(tab => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => changeTab(tab)}>{tab === 'calls' ? 'Calls' : tab.charAt(0).toUpperCase()+tab.slice(1)}</button>)}</nav></div>

      <div className="comm-scroll">
        {activeTab === 'all' && <div className="comm-list"><div className="comm-list-label">Latest communications</div>{!allItems.length && <div className="comm-empty">No communications on file.</div>}{allItems.map(item => <button type="button" key={item.key} className="comm-row" onClick={() => openAllItem(item)}><span className={`comm-type-icon ${item.type}`}><TypeIcon type={item.type}/></span><span className="comm-row-copy"><span className="comm-row-top"><strong>{item.title}</strong><time>{item.when}</time></span><span className="comm-row-sub">{item.lead.company}</span><span className="comm-row-detail">{item.detail}</span></span></button>)}</div>}

        {activeTab === 'messages' && !currentMessageLead && <div className="comm-list"><div className="comm-list-label">Messages</div>{!messageConversations.length && <div className="comm-empty">No message threads found.</div>}{messageConversations.map(item => { const latest = newestByTime(item.sms || [], msg => msg.t)[0]; const type = latest?.ch === 'wa' ? 'wa' : 'sms'; return <button type="button" className="comm-row" key={item.id} onClick={() => openMessageThread(item,type)}><span className={`comm-type-icon ${type}`}><TypeIcon type={type}/></span><span className="comm-row-copy"><span className="comm-row-top"><strong>{item.contact}</strong><time>{latest?.t || item.lastAgo}</time></span><span className="comm-row-sub">{item.company}</span><span className="comm-row-detail">{latest?.txt || 'No messages'}</span></span></button>; })}</div>}

        {activeTab === 'messages' && currentMessageLead && <div className="comm-thread-view"><div className="comm-thread-toolbar"><button type="button" className="comm-contact-back" onClick={() => setMessageLeadId(null)}><ArrowLeft size={14}/> Messages</button><span className="comm-thread-channel"><TypeIcon type={messageChannel}/>{messageChannel === 'wa' ? 'WhatsApp' : 'SMS'}</span></div><div className="comm-thread">{threadMessages.map((msg,index) => { const mine = msg.dir === 'out'; const type = msg.ch === 'wa' ? 'wa' : 'sms'; return <Fragment key={`${msg.t}-${index}`}><div className={`comm-bubble ${mine ? 'out' : 'in'}`}><span className="comm-bubble-channel"><TypeIcon type={type} size={10}/></span><span>{msg.txt}</span></div><div className={`comm-bubble-time ${mine ? 'out' : 'in'}`}>{msg.t}</div></Fragment>; })}</div></div>}

        {activeTab === 'calls' && !openCall && <div className="comm-list"><div className="comm-list-label">Recent calls</div>{!callItems.length && <div className="comm-empty">No calls on file.</div>}{callItems.map(row => <button type="button" className="comm-row" key={row.key} onClick={() => { chooseLead(row.lead); setOpenCall(row); }}><span className="comm-type-icon call">{row.entry.dir === 'out' ? <PhoneOutgoing size={14}/> : <PhoneIncoming size={14}/>}</span><span className="comm-row-copy"><span className="comm-row-top"><strong>{row.entry.who || row.lead.contact}</strong><time>{row.when}</time></span><span className="comm-row-sub">{row.lead.company}</span><span className="comm-row-detail">{row.entry.n} · {row.entry.dur}</span></span></button>)}</div>}
        {activeTab === 'calls' && openCall && <div className="comm-detail-view"><button type="button" className="comm-contact-back" onClick={() => setOpenCall(null)}><ArrowLeft size={14}/> Calls</button><div className="comm-detail-card"><span className="comm-detail-kicker">{openCall.entry.dir === 'in' ? 'Incoming' : 'Outgoing'} call</span><strong>{openCall.entry.who || openCall.lead.contact}</strong><span>{openCall.lead.company}</span><div className="comm-detail-meta"><b>{openCall.entry.n}</b><span>{openCall.entry.when}</span><span>{openCall.entry.dur}</span></div>{openCall.entry.note && <p>{openCall.entry.note}</p>}<div className="comm-detail-actions"><button type="button" onClick={() => onCall?.(openCall.entry.n)} title="Call"><Phone size={14}/></button></div></div></div>}

        {activeTab === 'contacts' && !openContact && <div className="comm-contacts"><label className="comm-search"><Search size={14}/><input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search contacts"/></label><div className="comm-contact-book">{groupedContacts.map(([letter,items]) => <div className="comm-contact-group" key={letter}><div className="comm-contact-letter">{letter}</div>{items.map(item => <button type="button" className="comm-contact-row" key={item.id} onClick={() => { chooseLead(item); setOpenContactId(item.id); }}><span><strong>{item.contact}</strong><small>{item.company}</small></span><em>{item.mobiles?.[0]?.n || item.emails?.[0]?.n || ''}</em></button>)}</div>)}</div></div>}
        {activeTab === 'contacts' && openContact && <div className="comm-contact-detail"><button type="button" className="comm-contact-back" onClick={() => setOpenContactId(null)}><ArrowLeft size={14}/> Contacts</button><div className="comm-contact-detail-head"><strong>{openContact.contact}</strong><span>{openContact.company}</span><div className="comm-contact-actions">{openContact.mobiles?.[0]?.n && <><button type="button" onClick={() => onCall?.(openContact.mobiles[0].n)} title="Call"><Phone size={14}/></button><button type="button" onClick={() => openMessageThread(openContact,'sms')} title="SMS"><MessageSquareText size={14}/></button><a href={whatsappHref(openContact.mobiles[0].n)} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={14}/></a></>}{openContact.emails?.[0]?.n && <a href={`mailto:${openContact.emails[0].n}`} title="Email"><Mail size={14}/></a>}</div></div><div className="comm-contact-detail-list">{openContact.mobiles.map((phone,index) => <div className="comm-contact-detail-row" key={`${phone.n}-${index}`}><span><small>{phone.l}</small><strong>{phone.n}</strong></span><div className="comm-mini-actions"><button type="button" onClick={() => onCall?.(phone.n)}><Phone size={13}/></button><button type="button" onClick={() => { onPreferredMobileChange?.(phone.n); openMessageThread(openContact,'sms'); }}><MessageSquareText size={13}/></button><a href={whatsappHref(phone.n)} target="_blank" rel="noreferrer"><MessageCircle size={13}/></a></div></div>)}{openContact.landlines.map((phone,index) => <div className="comm-contact-detail-row" key={`${phone.n}-${index}`}><span><small>{phone.l}</small><strong>{phone.n}</strong></span><div className="comm-mini-actions"><button type="button" onClick={() => onCall?.(phone.n)}><Phone size={13}/></button></div></div>)}{openContact.emails.map((email,index) => <div className="comm-contact-detail-row" key={`${email.n}-${index}`}><span><small>{email.l}</small><strong>{email.n}</strong></span><div className="comm-mini-actions"><a href={`mailto:${email.n}`}><Mail size={13}/></a></div></div>)}</div></div>}

        {activeTab === 'email' && !(openEmailKey || emailLeadId) && <div className="comm-list"><div className="comm-list-label comm-list-label-row"><span>Email</span>{lead && <button type="button" className="comm-small-action" onClick={() => openEmailComposer(lead)} title="Compose email"><SquarePen size={14}/></button>}</div>{!emailItems.length && <div className="comm-empty">No email history on file.</div>}{emailItems.map(row => <button type="button" className="comm-row" key={row.key} onClick={() => openEmailComposer(row.lead,row.key,false)}><span className="comm-type-icon email"><Mail size={14}/></span><span className="comm-row-copy"><span className="comm-row-top"><strong>{row.entry.sub}</strong><time>{row.when}</time></span><span className="comm-row-sub">{row.lead.contact} · {row.lead.company}</span><span className="comm-row-detail">{row.entry.preview}</span></span></button>)}</div>}
        {activeTab === 'email' && (openEmailKey || emailLeadId) && <div className="comm-email-view"><div className="comm-thread-toolbar"><button type="button" className="comm-contact-back" onClick={() => { setOpenEmailKey(null); setEmailLeadId(null); setEmailSubject(''); setEmailBody(''); }}><ArrowLeft size={14}/> Email</button>{activeEmail && <button type="button" className="comm-small-action" onClick={() => openEmailComposer(activeEmail.lead,activeEmail.key,true)} title="Reply"><Reply size={14}/></button>}</div>{activeEmail && <article className="comm-email-open"><div className="comm-email-meta"><strong>{activeEmail.entry.from}</strong><time>{activeEmail.entry.when}</time></div><h3>{activeEmail.entry.sub}</h3><p>{activeEmail.entry.preview}</p></article>}{!activeEmail && <div className="comm-email-new-label">New email to {activeEmailLead?.contact || ''}</div>}</div>}
      </div>

      {activeTab === 'messages' && currentMessageLead && <div className="comm-composer"><button type="button" className="comm-channel-toggle" onClick={() => setMessageChannel(c => c === 'sms' ? 'wa' : 'sms')} title="Switch channel"><TypeIcon type={messageChannel}/></button><textarea ref={composerRef} value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={messageChannel === 'wa' ? 'WhatsApp message' : 'Message'} rows={1}/><button type="button" onClick={sendMessage} disabled={!messageText.trim() || !currentMobile} title="Send" className="comm-send"><Send size={15}/></button></div>}
      {activeTab === 'email' && (openEmailKey || emailLeadId) && <div className="comm-email-compose"><div className="comm-email-address-row"><span>To</span><strong>{activeEmailLead?.emails?.[0]?.n || 'No email'}</strong></div><label className="comm-email-subject"><span>Subject</span><input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject"/></label><textarea ref={replyRef} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder={activeEmail ? 'Reply…' : 'Write email…'}/><div className="comm-email-actions"><span className="comm-email-from">sales@forgecrm.com</span><button type="button" onClick={sendEmail} disabled={!emailBody.trim() || !activeEmailLead?.emails?.[0]?.n} className="comm-send"><Send size={14}/></button></div></div>}
    </div>
  );
}
