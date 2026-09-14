import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, MessageSquareText, Search } from 'lucide-react';
import type { Lead } from '../data';
import { ageMinutes } from '../lib/comm';
import IOSCommPanel from './IOSCommPanel';

interface Props {
  leads: Lead[];
  selectedLeadId: string;
  setSelectedLeadId: (id: string) => void;
  preferredNumber: string;
  setPreferredNumber: (number: string) => void;
  onCall: (number: string) => void;
  openThread?: { leadId: string; nonce: number } | null;
}
function newestMessage(lead: Lead) {
  return [...(lead.sms || [])].sort((a,b) => ageMinutes(a.t) - ageMinutes(b.t))[0] || null;
}
export default function MessagesView({ leads, selectedLeadId, setSelectedLeadId, preferredNumber, setPreferredNumber, onCall, openThread }: Props) {
  const [query, setQuery] = useState('');
  const [openedLeadId, setOpenedLeadId] = useState<string | null>(null);
  useEffect(() => { if (openThread) setOpenedLeadId(openThread.leadId); }, [openThread]);
  const visibleLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter(item => item.sms?.length && (!q || `${item.contact} ${item.company}`.toLowerCase().includes(q)))
      .sort((a,b) => ageMinutes(newestMessage(a)?.t || a.lastAgo) - ageMinutes(newestMessage(b)?.t || b.lastAgo));
  }, [leads, query]);
  const openedLead = leads.find(item => item.id === openedLeadId) || null;
  if (openedLead) {
    const activeNumber = openedLead.mobiles.some(phone => phone.n === preferredNumber) ? preferredNumber : (openedLead.mobiles[0]?.n || '');
    return <div className="messages-page messages-thread-page"><IOSCommPanel lead={openedLead} contacts={leads} preferredMobile={activeNumber} fullWidth defaultTab="messages" openThreadOnLoad onBack={() => setOpenedLeadId(null)} onSelectLead={setSelectedLeadId} onPreferredMobileChange={setPreferredNumber} onCall={onCall}/></div>;
  }
  return (
    <div className="messages-page forge-panel-surface">
      <header className="messages-page-head"><div><h1>Messages</h1><span>Newest conversations first</span></div><label className="messages-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"/></label></header>
      <div className="messages-list">
        {!visibleLeads.length && <div className="comm-empty">No conversations found.</div>}
        {visibleLeads.map(item => {
          const latest = newestMessage(item); const isWa = latest?.ch === 'wa';
          return <button type="button" key={item.id} onClick={() => { setSelectedLeadId(item.id); setPreferredNumber(item.mobiles[0]?.n || ''); setOpenedLeadId(item.id); }} className={`messages-list-row ${selectedLeadId === item.id ? 'selected' : ''}`}><span className={`messages-list-icon ${isWa ? 'wa' : 'sms'}`}>{isWa ? <MessageCircle size={14}/> : <MessageSquareText size={14}/>}</span><span className="messages-list-copy"><strong>{item.contact}</strong><small>{item.company}</small><p>{latest?.txt || 'No messages'}</p></span><time>{latest?.t || item.lastAgo}</time></button>;
        })}
      </div>
    </div>
  );
}
