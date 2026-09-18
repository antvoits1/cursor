import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCheck, Grid3x3, Mail, MessageCircle, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, RefreshCw, Search, Send, Settings, SquarePen, Users } from 'lucide-react';
import type { CommTab } from '../store';
import type { BridgeCall, BridgeContact, BridgeMessage, LiveCall, PhoneBridge } from '../lib/bridge';
import { digitsOnly, newestByTime, oldestByTime, whatsappHref } from '../lib/comm';
import { DIAL_KEYS, playDtmf } from '../lib/dtmf';

interface Props {
  bridge: PhoneBridge;
  defaultTab: CommTab;
  navColor: string;
  onOpenSettings: () => void;
  onNotice: (message: string) => void;
}

function isDarkColor(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(n)) return true;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

function formatDial(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) return value;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return value;
}

function peerOf(item: BridgeMessage): string {
  const sent = /sent/i.test(item.folder || '');
  return (sent ? item.to : item.from) || item.from || item.to || '';
}

function isOutbound(item: BridgeMessage): boolean {
  return /sent/i.test(item.folder || '') || Boolean(item.to && !item.from);
}

function callIcon(direction: string) {
  const value = direction.toLowerCase();
  if (value.includes('miss')) return <PhoneMissed size={14}/>;
  if (value.includes('out')) return <PhoneOutgoing size={14}/>;
  return <PhoneIncoming size={14}/>;
}

function contactMatch(contacts: BridgeContact[], number: string): BridgeContact | undefined {
  const clean = digitsOnly(number).replace(/^\+/, '');
  return contacts.find(item => item.phones.some(phone => digitsOnly(phone).replace(/^\+/, '').endsWith(clean) || clean.endsWith(digitsOnly(phone).replace(/^\+/, ''))));
}

export default function DeskPhone({ bridge, defaultTab, navColor, onOpenSettings, onNotice }: Props) {
  const [tab, setTab] = useState<CommTab>(defaultTab);
  const [dialDigits, setDialDigits] = useState('');
  const [threadKey, setThreadKey] = useState('');
  const [messageText, setMessageText] = useState('');
  const [composeNumber, setComposeNumber] = useState('');
  const [composing, setComposing] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [openContact, setOpenContact] = useState<BridgeContact | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dialRef = useRef(dialDigits);
  dialRef.current = dialDigits;

  useEffect(() => { setTab(defaultTab); }, [defaultTab]);
  useEffect(() => {
    setThreadKey('');
    setComposing(false);
    setOpenContact(null);
    setMessageText('');
  }, [bridge.selectedDeviceId]);

  const threads = useMemo(() => {
    const map = new Map<string, { key: string; peer: string; latest: BridgeMessage; items: BridgeMessage[] }>();
    newestByTime(bridge.messages, item => item.date || '').forEach(item => {
      const peer = peerOf(item);
      const key = digitsOnly(peer) || peer || item.handle || 'unknown';
      const current = map.get(key);
      if (current) current.items.push(item);
      else map.set(key, { key, peer, latest: item, items: [item] });
    });
    return Array.from(map.values());
  }, [bridge.messages]);

  const openThread = threads.find(item => item.key === threadKey);
  const threadMessages = useMemo(() => openThread ? oldestByTime(openThread.items, item => item.date || '') : [], [openThread]);
  const currentNumber = composing ? composeNumber : (openThread?.peer || '');
  const phoneContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return [...bridge.contacts]
      .filter(item => !q || `${item.name} ${item.organization || ''} ${item.phones.join(' ')} ${item.emails.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bridge.contacts, contactSearch]);
  const groupedContacts = useMemo(() => {
    const groups = new Map<string, BridgeContact[]>();
    phoneContacts.forEach(item => {
      const letter = item.name.trim().charAt(0).toUpperCase() || '#';
      groups.set(letter, [...(groups.get(letter) || []), item]);
    });
    return Array.from(groups.entries());
  }, [phoneContacts]);

  const appendDial = (digit: string) => {
    if (digit !== '+') playDtmf(digit);
    setDialDigits(current => `${current}${digit}`.slice(0, 16));
  };

  const startCall = async (number?: string) => {
    const clean = digitsOnly(number || dialRef.current);
    if (!clean) return;
    const adapter = window.ForgeTelephonyAdapter;
    if (adapter?.startCall) {
      try { await adapter.startCall({ number: clean }); return; }
      catch { onNotice('Phone connection failed. Check the connected device or provider.'); return; }
    }
    if (bridge.kind === 'synced' || bridge.kind === 'authed') {
      try {
        const ok = await bridge.placeCall(clean);
        if (ok) {
          onNotice(`Call requested on ${bridge.selectedDevice?.name || 'the connected phone'}.`);
          return;
        }
      } catch { /* fall through */ }
    }
    const event = new CustomEvent('forge:call-request', { detail: { number: clean }, cancelable: true });
    const unhandled = window.dispatchEvent(event);
    if (unhandled) onNotice('Connect a Bluetooth phone through the Windows bridge to place calls.');
  };

  const endCall = async () => {
    const ok = await bridge.hangUp();
    if (ok) { onNotice('Call ended.'); return; }
    onNotice('Hang up on the phone. The Windows engine has no hang-up HTTP route.');
  };

  const sendMessage = async () => {
    const number = digitsOnly(currentNumber);
    const text = messageText.trim();
    if (!number || !text) return;
    const ok = await bridge.sendSms(number, text);
    if (ok) {
      setMessageText('');
      setComposing(false);
      setThreadKey(number);
      onNotice(`SMS handed to ${bridge.selectedDevice?.name || 'the connected phone'}.`);
      return;
    }
    window.location.href = `sms:${number}?body=${encodeURIComponent(text)}`;
  };

  const sendEmail = () => {
    const email = emailTo.trim();
    const body = emailBody.trim();
    if (!email || !body) return;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(emailSubject.trim())}&body=${encodeURIComponent(body)}`;
  };

  const openSms = (number: string) => {
    setTab('messages');
    setComposing(false);
    setComposeNumber(number);
    setThreadKey(digitsOnly(number) || number);
    setMessageText('');
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  const startCompose = (number = '') => {
    setTab('messages');
    setComposing(true);
    setThreadKey('');
    setComposeNumber(number);
    setMessageText('');
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        if (event.key === 'Enter' && !event.shiftKey && target === composerRef.current) {
          event.preventDefault();
          void sendMessage();
        }
        return;
      }
      const key = event.key;
      if (/^[0-9]$/.test(key) || key === '*' || key === '#') {
        event.preventDefault();
        appendDial(key);
      } else if (key === '+') {
        event.preventDefault();
        setDialDigits(current => current ? current : '+');
      } else if (key === 'Backspace') {
        event.preventDefault();
        setDialDigits(current => current.slice(0, -1));
      } else if (key === 'Enter') {
        event.preventDefault();
        void startCall();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const inMessages = tab === 'messages' && (Boolean(openThread) || composing);
  const title = tab === 'messages' && openThread
    ? (contactMatch(bridge.contacts, openThread.peer)?.name || openThread.peer || 'Message')
    : tab === 'messages' && composing ? 'New message'
    : tab === 'contacts' && openContact ? openContact.name
    : tab === 'messages' ? 'Messages'
    : tab === 'recents' ? 'Recents'
    : tab === 'contacts' ? 'Contacts'
    : 'Mail';

  return (
    <div className="desk-app">
      <header className={`desk-topbar ${isDarkColor(navColor) ? 'dark' : 'light'}`}>
        <div className="desk-brand">Desk Phone <em>PC dialer</em></div>
        <div className="link-device-row desk-devices">
          {bridge.devices.map(device => (
            <button type="button" key={device.id} className={`${device.id === bridge.selectedDeviceId ? 'active' : ''}${device.connected ? ' live' : ''}`} onClick={() => bridge.setSelectedDeviceId(device.id)}>
              <span>{device.name}</span>
            </button>
          ))}
          {!bridge.devices.length && <span className="desk-idle">No paired phones yet</span>}
        </div>
        <span className="desk-status">{bridge.label}</span>
        <button type="button" className="desk-tool" title="Refresh extracted data" onClick={() => { void bridge.refreshNow(); }}><RefreshCw size={16}/></button>
        <button type="button" className="desk-tool" title="Settings" onClick={onOpenSettings}><Settings size={16}/></button>
      </header>

      {bridge.mock && (
        <div className="desk-banner" role="status">Local mock with two connected phones. On Windows, run the C# bridge for the real Bluetooth devices — this screen does not invent Apple messaging or Phone Link internals.</div>
      )}
      {bridge.liveCall && <CallBar call={bridge.liveCall} onHangUp={() => { void endCall(); }}/>}

      <div className="desk-shell">
        <nav className="desk-rail" aria-label="Desk Phone">
          <RailButton tab="messages" current={tab} onClick={setTab} icon={<MessageSquare size={18}/>} label="Messages"/>
          <RailButton tab="recents" current={tab} onClick={setTab} icon={<Phone size={18}/>} label="Recents"/>
          <RailButton tab="contacts" current={tab} onClick={setTab} icon={<Users size={18}/>} label="Contacts"/>
          <RailButton tab="mail" current={tab} onClick={setTab} icon={<Mail size={18}/>} label="Mail"/>
          <div className="desk-rail-note"><Grid3x3 size={14}/> Dialer stays on the right. Type a number anytime.</div>
        </nav>

        <section className="desk-main forge-panel-surface">
          <header className="desk-main-head">
            <div className="desk-main-head-side">
              {tab === 'messages' && (openThread || composing) && (
                <button type="button" className="comm-contact-back" onClick={() => { setThreadKey(''); setComposing(false); }}><ArrowLeft size={16}/> Messages</button>
              )}
              {tab === 'contacts' && openContact && (
                <button type="button" className="comm-contact-back" onClick={() => setOpenContact(null)}><ArrowLeft size={16}/> Contacts</button>
              )}
            </div>
            <strong>{title}</strong>
            <div className="desk-main-head-side end">
              {tab === 'messages' && !inMessages && <button type="button" className="comm-icon-button" title="New message" onClick={() => startCompose()}><SquarePen size={16}/></button>}
              {tab === 'mail' && <button type="button" className="comm-icon-button" title="Compose email" onClick={() => { setEmailTo(openContact?.emails[0] || ''); setEmailSubject(''); setEmailBody(''); }}><SquarePen size={16}/></button>}
            </div>
          </header>

          <div className="comm-scroll">
            {tab === 'messages' && !openThread && !composing && (
              <div className="comm-list">
                {!threads.length && <div className="comm-empty">No SMS threads on the selected phone. MAP extract runs when a phone connects.</div>}
                {threads.map(thread => {
                  const name = contactMatch(bridge.contacts, thread.peer)?.name || thread.peer || 'Unknown';
                  return (
                    <button type="button" className="comm-row" key={thread.key} onClick={() => { setThreadKey(thread.key); setComposing(false); }}>
                      <span className="comm-type-icon sms"><MessageSquare size={14}/></span>
                      <span className="comm-row-copy">
                        <span className="comm-row-top"><strong>{name}</strong><time>{thread.latest.date || ''}</time></span>
                        <span className="comm-row-sub">{thread.peer}</span>
                        <span className="comm-row-detail">{thread.latest.preview || thread.latest.body || ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {tab === 'messages' && (openThread || composing) && (
              <div className="comm-thread-view">
                <div className="comm-thread">
                  {threadMessages.map((msg, index) => {
                    const mine = isOutbound(msg);
                    return (
                      <div className="comm-bubble-wrap" key={`${msg.handle}-${index}`}>
                        <div className={`comm-bubble ${mine ? 'out' : 'in'}`}>
                          <span>{msg.body || msg.preview || ''}</span>
                          <span className="comm-bubble-meta"><time>{msg.date || ''}</time>{mine && <CheckCheck size={12} strokeWidth={2.5}/>}</span>
                        </div>
                      </div>
                    );
                  })}
                  {composing && !threadMessages.length && <div className="comm-empty">SMS uses the selected Bluetooth phone. This is not Apple messaging.</div>}
                </div>
              </div>
            )}

            {tab === 'recents' && (
              <div className="comm-list">
                {!bridge.calls.length && <div className="comm-empty">No call history on the selected phone. PBAP extract runs when a phone connects.</div>}
                {bridge.calls.map((item, index) => {
                  const name = item.name || contactMatch(bridge.contacts, item.number || '')?.name || item.number || 'Unknown';
                  return (
                    <button type="button" className="comm-row" key={`${item.deviceId}-${item.number}-${index}`} onClick={() => { setDialDigits(item.number || ''); void startCall(item.number); }}>
                      <span className="comm-type-icon call">{callIcon(item.direction || '')}</span>
                      <span className="comm-row-copy">
                        <span className="comm-row-top"><strong>{name}</strong><time>{item.when || ''}</time></span>
                        <span className="comm-row-detail">{item.direction || 'call'} · {item.number || ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {tab === 'contacts' && !openContact && (
              <div className="comm-contacts">
                <label className="comm-search"><Search size={14}/><input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search contacts"/></label>
                <div className="comm-contact-book">
                  {!groupedContacts.length && <div className="comm-empty">No PBAP contacts on the selected phone.</div>}
                  {groupedContacts.map(([letter, items]) => (
                    <div className="comm-contact-group" key={letter}>
                      <div className="comm-contact-letter">{letter}</div>
                      {items.map(item => (
                        <button type="button" className="comm-contact-row" key={`${item.deviceId}-${item.name}`} onClick={() => { setOpenContact(item); setEmailTo(item.emails[0] || ''); }}>
                          <span><strong>{item.name}</strong><small>{item.organization || item.deviceName || 'PBAP'}</small></span>
                          <em>{item.phones[0] || item.emails[0] || ''}</em>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'contacts' && openContact && (
              <div className="comm-contact-detail">
                <div className="comm-contact-detail-head">
                  <strong>{openContact.name}</strong>
                  <span>{openContact.organization || openContact.deviceName || 'Phone book'}</span>
                  <div className="comm-contact-actions">
                    {openContact.phones[0] && (
                      <>
                        <button type="button" onClick={() => { void startCall(openContact.phones[0]); }} title="Call"><Phone size={14}/></button>
                        <button type="button" onClick={() => openSms(openContact.phones[0])} title="SMS"><MessageSquare size={14}/></button>
                        <a href={whatsappHref(openContact.phones[0])} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={14}/></a>
                      </>
                    )}
                    {openContact.emails[0] && <a href={`mailto:${openContact.emails[0]}`} title="Email"><Mail size={14}/></a>}
                  </div>
                </div>
                <div className="comm-contact-detail-list">
                  {openContact.phones.map((phone, index) => (
                    <div className="comm-contact-detail-row" key={`${phone}-${index}`}>
                      <span><small>Mobile</small><strong>{phone}</strong></span>
                      <div className="comm-mini-actions">
                        <button type="button" onClick={() => { void startCall(phone); }} title="Call"><Phone size={13}/></button>
                        <button type="button" onClick={() => openSms(phone)} title="SMS"><MessageSquare size={13}/></button>
                        <a href={whatsappHref(phone)} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={13}/></a>
                      </div>
                    </div>
                  ))}
                  {openContact.emails.map((email, index) => (
                    <div className="comm-contact-detail-row" key={`${email}-${index}`}>
                      <span><small>Mail</small><strong>{email}</strong></span>
                      <div className="comm-mini-actions">
                        <a href={`mailto:${email}`} title="Email"><Mail size={13}/></a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'mail' && (
              <div className="comm-email-view">
                <div className="comm-email-new-label">Mail uses the Windows default app through mailto. There is no mailbox sync in this build.</div>
              </div>
            )}
          </div>

          {tab === 'messages' && (openThread || composing) && (
            <div className="comm-composer">
              {composing && (
                <input className="desk-compose-number" value={composeNumber} onChange={e => setComposeNumber(e.target.value)} placeholder="Mobile number" aria-label="Mobile number"/>
              )}
              <textarea ref={composerRef} value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder="Message" rows={1}/>
              <button type="button" onClick={() => { void sendMessage(); }} disabled={!messageText.trim() || !digitsOnly(currentNumber)} title="Send" className="comm-send"><Send size={15}/></button>
            </div>
          )}
          {tab === 'mail' && (
            <div className="comm-email-compose">
              <label className="comm-email-subject">
                <span>To</span>
                {openContact && openContact.emails.length > 1 ? (
                  <select value={emailTo} onChange={e => setEmailTo(e.target.value)}>
                    {openContact.emails.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                ) : <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="name@company.com"/>}
              </label>
              <label className="comm-email-subject"><span>Subject</span><input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject"/></label>
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && emailBody.trim()) { e.preventDefault(); sendEmail(); } }} placeholder="Write email…"/>
              <div className="comm-email-actions">
                <span className="comm-email-from">mailto · Enter sends</span>
                <button type="button" onClick={sendEmail} disabled={!emailBody.trim() || !emailTo.trim()} className="comm-send" title="Send"><Send size={14}/></button>
              </div>
            </div>
          )}
        </section>

        <aside className="desk-dialer forge-panel-surface">
          <div className="desk-dialer-kicker"><strong>Dialer</strong><em>{bridge.selectedDevice?.name || 'No phone'}</em></div>
          <DialPad digits={dialDigits} liveCall={bridge.liveCall} ready={bridge.kind === 'synced'} onAppend={appendDial} onClear={() => setDialDigits(current => current.slice(0, -1))} onPlus={() => setDialDigits(current => current.startsWith('+') ? current : `+${current}`)} onCall={() => { void startCall(); }} onHangUp={() => { void endCall(); }}/>
        </aside>
      </div>
    </div>
  );
}

function RailButton({ tab, current, onClick, icon, label }: { tab: CommTab; current: CommTab; onClick: (tab: CommTab) => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" className={current === tab ? 'active' : ''} onClick={() => onClick(tab)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function CallBar({ call, onHangUp }: { call: LiveCall; onHangUp: () => void }) {
  return (
    <div className="desk-callbar" role="status">
      <Phone size={14}/>
      <strong>Calling {formatDial(call.number)}</strong>
      <span>on {call.deviceName}</span>
      <button type="button" onClick={onHangUp}><PhoneOff size={14}/> Hang up</button>
    </div>
  );
}

function DialPad({ digits, liveCall, ready, onAppend, onClear, onPlus, onCall, onHangUp }: {
  digits: string;
  liveCall: LiveCall | null;
  ready: boolean;
  onAppend: (digit: string) => void;
  onClear: () => void;
  onPlus: () => void;
  onCall: () => void;
  onHangUp: () => void;
}) {
  return (
    <div className="dial-view desk-pad">
      <div className="dial-status">{ready ? 'Ready on the selected Bluetooth phone' : 'Call hands off to a connected phone or Windows bridge'}</div>
      <div className="dial-number">{digits ? formatDial(digits) : 'Enter a number'}</div>
      <div className="dial-hint">Keyboard digits, *, #, Backspace, and Enter are live. Enter places the call.</div>
      <div className="dial-pad">
        {DIAL_KEYS.map(([digit, letters]) => (
          <button type="button" key={digit} className="dial-key" onClick={() => onAppend(digit)}>
            <b>{digit}</b>
            {letters ? <s>{letters}</s> : <s>&nbsp;</s>}
          </button>
        ))}
      </div>
      <div className="dial-actions">
        <button type="button" className="dial-clear" onClick={onClear} disabled={!digits} title="Delete">⌫</button>
        {liveCall
          ? <button type="button" className="dial-hangup" onClick={onHangUp} title="Hang up"><PhoneOff size={18} strokeWidth={2}/></button>
          : <button type="button" className="dial-call" onClick={onCall} title="Call"><Phone size={18} strokeWidth={2}/></button>}
        <button type="button" className="dial-plus" onClick={onPlus} title="Plus">+</button>
      </div>
    </div>
  );
}
