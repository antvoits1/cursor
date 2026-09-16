import { useEffect, useRef, useState } from 'react';
import { leads } from '../../data/leads';
import type { Lead, LeadFilter } from '../../data/types';
import { money } from '../../lib/format';
import { filterLeads } from '../../lib/leads';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

const FILTERS: Array<{ id: LeadFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'hot', label: 'Hot' },
];

function LeadRow({ lead, active }: { lead: Lead; active: boolean }) {
  const { selectLead } = useCrm();
  return (
    <button
      type="button"
      className={`lead-row${active ? ' active' : ''}`}
      onClick={() => selectLead(lead.id)}
    >
      <div className="lead-main">
        <div className="lead-company">{lead.company}</div>
        <div className="lead-owner">{lead.contact}</div>
      </div>
      <div className="lead-side">
        <div className="lead-revenue">{money(lead.avg)}</div>
        <div className="lead-activity">{lead.lastAgo}</div>
      </div>
    </button>
  );
}

export function LeadsPanel() {
  const { selectedLeadId, filter, setFilter } = useCrm();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const visible = filterLeads(leads, filter, query);

  return (
    <section className="panel" id="leadsPanel">
      <div className="panel-head">
        <span className="panel-title">Leads</span>
        <span className="panel-muted">{visible.length}</span>
        <input
          className="lead-search"
          type="search"
          placeholder="Search"
          aria-label="Search leads"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="lead-filter-menu" ref={menuRef}>
          <button
            type="button"
            className={`filter-menu-btn${menuOpen ? ' active' : ''}`}
            title="Lead filters"
            aria-label="Lead filters"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name="filter" size={14} />
          </button>
          {menuOpen && (
            <div className="filter-menu-pop">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`lead-filter${filter === f.id ? ' active' : ''}`}
                  onClick={() => {
                    setFilter(f.id);
                    setMenuOpen(false);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="lead-list">
        {visible.length === 0 && <div className="empty-note">No leads match</div>}
        {visible.map((lead) => (
          <LeadRow key={lead.id} lead={lead} active={lead.id === selectedLeadId} />
        ))}
      </div>
    </section>
  );
}
