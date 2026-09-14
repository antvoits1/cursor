import { useMemo, useState } from 'react';
import { Search, Filter } from 'lucide-react';
import type { Lead } from '../data';
import { formatAgo } from '../lib/format';

interface Props {
  leads: Lead[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}

export default function LeadsRail({ leads, selectedId, setSelectedId }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [sortByRevenue, setSortByRevenue] = useState(false);
  const visibleLeads = useMemo(() => {
    let result = leads;
    const q = query.trim().toLowerCase();
    if (q) result = result.filter(l => `${l.company} ${l.contact}`.toLowerCase().includes(q));
    if (sortByRevenue) result = [...result].sort((a,b) => b.avg - a.avg);
    return result;
  }, [leads, query, sortByRevenue]);

  return (
    <section data-panel="leads" className="forge-leads-panel forge-panel-surface">
      <div className="forge-leads-head">
        <div className="forge-leads-title-row">
          <h2>Leads</h2>
          <span className="panel-count">{visibleLeads.length}</span>
        </div>
        <div className="forge-leads-actions">
          <button type="button" onClick={() => setShowSearch(v => !v)} title="Search leads" className={showSearch ? 'active' : ''}><Search size={16}/></button>
          <button type="button" onClick={() => setSortByRevenue(v => !v)} title="Sort by revenue" className={sortByRevenue ? 'active' : ''}><Filter size={16}/></button>
        </div>
      </div>
      {showSearch && (
        <label className="forge-leads-search">
          <Search size={14}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search company or owner"/>
        </label>
      )}
      <div className="forge-leads-list">
        {!visibleLeads.length && <div className="forge-empty">No leads match.</div>}
        {visibleLeads.map(lead => (
          <button key={lead.id} type="button" onClick={() => setSelectedId(lead.id)} className={`forge-lead-row ${selectedId === lead.id ? 'active' : ''}`}>
            <span className="forge-lead-copy"><strong>{lead.company}</strong><span>{lead.contact}</span></span>
            <span className="forge-lead-side"><strong>${Math.round(lead.avg).toLocaleString('en-US')}</strong><span>{formatAgo(lead.lastAgo)}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}
