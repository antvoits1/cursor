import { useEffect, useRef, useState } from 'react';
import { HOT_LEAD_IDS, leads } from '../../data/leads';
import type { Lead, LeadFilter } from '../../data/types';
import { money } from '../../lib/format';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

const FILTERS: Array<{ id: LeadFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'hot', label: 'Hot' },
];

function applyFilter(filter: LeadFilter): Lead[] {
  if (filter === 'starred') return leads.filter((l) => l.fav);
  if (filter === 'hot') return leads.filter((l) => HOT_LEAD_IDS.has(l.id));
  return leads;
}

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

  const visible = applyFilter(filter);

  return (
    <section className="panel" id="leadsPanel">
      <div className="panel-head">
        <span className="panel-title">Leads</span>
        <span className="panel-muted">{visible.length}</span>
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
        {visible.map((lead) => (
          <LeadRow key={lead.id} lead={lead} active={lead.id === selectedLeadId} />
        ))}
      </div>
    </section>
  );
}
