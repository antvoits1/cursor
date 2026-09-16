import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type UISettings } from './store';
import type { ActivePage } from './lib/navigation';
import { digitsOnly } from './lib/comm';
import { deriveNotifications, loadReadIds, saveReadIds, type CrmNotification } from './lib/notifications';
import NavRail from './components/NavRail';
import LeadsRail from './components/LeadsRail';
import LeadDetailPanel from './components/LeadDetailPanel';
import IOSCommPanel, { type PendingCommOpen } from './components/IOSCommPanel';
import MessagesView from './components/MessagesView';
import StatementViewerOverlay from './components/StatementViewerOverlay';
import SettingsModal from './components/SettingsModal';
import CallDock from './components/CallDock';

const PANEL_KEYS = { leads: 'forge.react.v15.panel.leads', comms: 'forge.react.v15.panel.comms' };
const DEFAULT_LEADS_WIDTH = 400;
const DEFAULT_COMMS_WIDTH = 320;
const MIN_LEADS_WIDTH = 300;
const MIN_DETAIL_WIDTH = 340;
const MIN_COMMS_WIDTH = 270;
const DIVIDER_WIDTH = 12;

function readSavedWidth(key: string): number | null {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value > 0 ? value : null; } catch { return null; }
}
function saveWidth(key: string, value: number): void { try { localStorage.setItem(key, String(Math.round(value))); } catch { /* optional */ } }
function autoScaleMode(): 'standard' | 'wide' | 'ultra' {
  const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  if (width >= 2400) return 'ultra';
  if (width >= 1600) return 'wide';
  return 'standard';
}
function scaleValue(mode: string): number { return mode === 'ultra' ? 1.04 : mode === 'wide' ? 1 : .96; }

export default function App() {
  const store = useStore();
  const { leads, screenScale, fontSize, navMode, leadDensity, motion, showFinancial, defaultCommsTab, canvasColor, sidebarColor, setSetting, setNavMode } = store;
  const requestedStartPage = document.body.dataset.startPage as ActivePage | undefined;
  const initialPage: ActivePage = requestedStartPage && ['crm','messages','email','scanner','command'].includes(requestedStartPage) ? requestedStartPage : 'crm';

  const [selectedId, setSelectedId] = useState(leads[0]?.id || '');
  const [activePage, setActivePage] = useState<ActivePage>(initialPage);
  const [showSettings, setShowSettings] = useState(false);
  const [viewerDocIndex, setViewerDocIndex] = useState<number | null>(null);
  const [messageNumber, setMessageNumber] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingThread, setPendingThread] = useState<{ leadId: string; channel: 'sms' | 'wa'; nonce: number } | null>(null);
  const [pendingComm, setPendingComm] = useState<PendingCommOpen | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const notifications = useMemo(() => deriveNotifications(leads), [leads]);
  const [leadsWidth, setLeadsWidth] = useState(() => readSavedWidth(PANEL_KEYS.leads) ?? DEFAULT_LEADS_WIDTH);
  const [commsWidth, setCommsWidth] = useState(() => readSavedWidth(PANEL_KEYS.comms) ?? DEFAULT_COMMS_WIDTH);
  const panelAreaRef = useRef<HTMLDivElement>(null);
  const lead = leads.find(item => item.id === selectedId) || leads[0];

  useEffect(() => {
    const apply = () => {
      const resolved = screenScale === 'auto' ? autoScaleMode() : screenScale;
      document.documentElement.style.setProperty('--ui-scale', String(scaleValue(resolved)));
      document.documentElement.style.setProperty('--font-offset', `${fontSize - 16.5}px`);
      document.documentElement.style.setProperty('--font-family-main', "'Inter', system-ui, sans-serif");
      document.documentElement.style.setProperty('--bg-canvas', canvasColor);
      document.documentElement.dataset.screenScale = resolved;
      document.documentElement.dataset.leadDensity = leadDensity;
      document.documentElement.dataset.motion = motion;
    };
    apply();
    if (screenScale === 'auto') { window.addEventListener('resize', apply); return () => window.removeEventListener('resize', apply); }
  }, [screenScale, fontSize, leadDensity, motion, canvasColor]);

  useEffect(() => {
    if (!lead) return;
    setMessageNumber(current => lead.mobiles?.some(phone => phone.n === current) ? current : (lead.mobiles?.[0]?.n || ''));
  }, [lead?.id]);

  const clampPanels = () => {
    const area = panelAreaRef.current;
    if (!area || activePage !== 'crm') return;
    const available = area.clientWidth - DIVIDER_WIDTH * 2;
    let nextLeads = Math.max(MIN_LEADS_WIDTH, Math.min(leadsWidth, available - MIN_DETAIL_WIDTH - MIN_COMMS_WIDTH));
    let nextComms = Math.max(MIN_COMMS_WIDTH, Math.min(commsWidth, available - MIN_DETAIL_WIDTH - nextLeads));
    if (nextLeads + nextComms + MIN_DETAIL_WIDTH > available) {
      nextLeads = MIN_LEADS_WIDTH;
      nextComms = Math.max(MIN_COMMS_WIDTH, available - MIN_DETAIL_WIDTH - nextLeads);
    }
    if (nextLeads !== leadsWidth) setLeadsWidth(nextLeads);
    if (nextComms !== commsWidth) setCommsWidth(nextComms);
  };
  useEffect(() => { clampPanels(); }, [navMode, activePage]);
  useEffect(() => { window.addEventListener('resize', clampPanels); return () => window.removeEventListener('resize', clampPanels); });
  useEffect(() => { saveWidth(PANEL_KEYS.leads, leadsWidth); }, [leadsWidth]);
  useEffect(() => { saveWidth(PANEL_KEYS.comms, commsWidth); }, [commsWidth]);

  const isTop = navMode === 'topbar';
  const isWide = navMode === 'sidebar-wide';
  const cycleNavMode = () => setNavMode(navMode === 'topbar' ? 'sidebar-slim' : navMode === 'sidebar-slim' ? 'sidebar-wide' : 'topbar');
  const openMessages = (number?: string) => {
    setPendingThread(null);
    setPendingComm(null);
    if (number) setMessageNumber(number);
    else if (lead) setMessageNumber(lead.mobiles?.[0]?.n || '');
    setActivePage('messages');
  };
  const handlePageChange = (page: ActivePage) => {
    setPendingThread(null);
    setPendingComm(null);
    if (page === 'messages' && lead) setMessageNumber(lead.mobiles?.[0]?.n || '');
    setActivePage(page);
  };
  const markRead = (id: string) => setReadIds(prev => { const next = new Set(prev); next.add(id); saveReadIds(next); return next; });
  const markAllRead = () => setReadIds(prev => { const next = new Set(prev); notifications.forEach(item => next.add(item.id)); saveReadIds(next); return next; });
  const openNotification = (item: CrmNotification) => {
    markRead(item.id);
    setSelectedId(item.leadId);
    const target = leads.find(entry => entry.id === item.leadId);
    if (item.number) setMessageNumber(item.number);
    else if (target) setMessageNumber(target.mobiles?.[0]?.n || '');
    if (item.kind === 'sms' || item.kind === 'wa') {
      setPendingComm(null);
      setPendingThread({ leadId: item.leadId, channel: item.kind, nonce: Date.now() });
      setActivePage('messages');
      return;
    }
    setPendingThread(null);
    if (item.kind === 'email') setPendingComm({ tab: 'email', leadId: item.leadId, emailKey: item.mailKey || null, nonce: Date.now() });
    else if (item.kind === 'call') setPendingComm({ tab: 'calls', leadId: item.leadId, callKey: item.callKey || null, nonce: Date.now() });
    else setPendingComm(null);
    setActivePage('crm');
  };
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(current => current === message ? '' : current), 2800);
  };
  const startCall = async (number: string) => {
    const clean = digitsOnly(number); if (!clean) return;
    const payload = { number: clean, leadId: lead?.id };
    
    // Set call state to ringing
    store.setCallState({
      status: 'ringing',
      number: clean,
      leadId: lead?.id,
      isMuted: false,
      isOnHold: false,
    });
    
    // Simulate connection after 2 seconds
    setTimeout(() => {
      store.setCallState({
        status: 'connected',
        startTime: Date.now()
      });
    }, 2000);

    const adapter = (window as Window & { ForgeTelephonyAdapter?: { startCall?: (payload: { number: string; leadId?: string }) => Promise<void> | void } }).ForgeTelephonyAdapter;
    if (adapter?.startCall) {
      try { await adapter.startCall(payload); return; }
      catch { showNotice('Phone connection failed. Check the connected device or provider.'); return; }
    }
    const event = new CustomEvent('forge:call-request', { detail: payload, cancelable: true });
    const unhandled = window.dispatchEvent(event);
    if (unhandled) showNotice('Connect a phone or calling provider to place calls.');
  };

  const startResize = (side: 'leads' | 'comms', clientX: number) => {
    const area = panelAreaRef.current; if (!area) return;
    const startX = clientX, startLeads = leadsWidth, startComms = commsWidth, available = area.clientWidth - DIVIDER_WIDTH * 2;
    document.body.classList.add('panel-resizing');
    const onMove = (event: PointerEvent) => {
      const delta = event.clientX - startX;
      if (side === 'leads') {
        const max = available - startComms - MIN_DETAIL_WIDTH;
        setLeadsWidth(Math.max(MIN_LEADS_WIDTH, Math.min(max, startLeads + delta)));
      } else {
        const max = available - startLeads - MIN_DETAIL_WIDTH;
        setCommsWidth(Math.max(MIN_COMMS_WIDTH, Math.min(max, startComms - delta)));
      }
    };
    const onUp = () => { document.body.classList.remove('panel-resizing'); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  };
  const resetPanels = () => { setLeadsWidth(DEFAULT_LEADS_WIDTH); setCommsWidth(DEFAULT_COMMS_WIDTH); requestAnimationFrame(clampPanels); };

  const minStmtIndex = lead?.mtd ? -1 : 0;
  const maxStmtIndex = lead ? lead.stmts.length - 1 : 0;
  const panelGridStyle = { gridTemplateColumns: `${leadsWidth}px ${DIVIDER_WIDTH}px minmax(${MIN_DETAIL_WIDTH}px,1fr) ${DIVIDER_WIDTH}px ${commsWidth}px` };
  const settings: UISettings = { screenScale, fontSize, navMode, leadDensity, motion, showFinancial, defaultCommsTab, canvasColor, sidebarColor };

  return (
    <div className={`forge-app ${isTop ? 'topbar-mode' : 'sidebar-mode'}`}>
      <NavRail isTop={isTop} isWide={isWide} navColor={sidebarColor} activePage={activePage} setActivePage={handlePageChange} cycleNavMode={cycleNavMode} onOpenSettings={() => setShowSettings(true)} notifications={notifications} readIds={readIds} onOpenNotification={openNotification} onMarkAllRead={markAllRead}/>
      <div ref={panelAreaRef} className="forge-workspace">
        {activePage === 'crm' && lead && (
          <div className="forge-panel-grid" style={panelGridStyle}>
            <LeadsRail leads={leads} selectedId={selectedId} setSelectedId={setSelectedId}/>
            <div className="panel-divider" role="separator" aria-orientation="vertical" aria-label="Resize leads panel" onPointerDown={e => startResize('leads', e.clientX)} onDoubleClick={resetPanels}/>
            <section data-panel="lead-detail" className="forge-panel-surface"><LeadDetailPanel lead={lead} onCall={startCall} onOpenMessages={openMessages} setViewerDocIndex={setViewerDocIndex} showApproval={showFinancial === 'show'}/></section>
            <div className="panel-divider" role="separator" aria-orientation="vertical" aria-label="Resize communications panel" onPointerDown={e => startResize('comms', e.clientX)} onDoubleClick={resetPanels}/>
            <section data-panel="communications" className="forge-panel-surface"><IOSCommPanel lead={lead} contacts={leads} preferredMobile={messageNumber} fullWidth defaultTab={defaultCommsTab} pendingOpen={pendingComm} onSelectLead={setSelectedId} onCall={startCall} onPreferredMobileChange={setMessageNumber}/></section>
          </div>
        )}
        {activePage === 'messages' && <MessagesView leads={leads} selectedLeadId={selectedId} setSelectedLeadId={setSelectedId} preferredNumber={messageNumber} setPreferredNumber={setMessageNumber} onCall={startCall} openThread={pendingThread}/>}
        {!['crm','messages'].includes(activePage) && <div className="forge-placeholder forge-panel-surface"><div><strong>{activePage}</strong><span>This page is not available in this build.</span></div></div>}
      </div>
      {lead && viewerDocIndex !== null && <StatementViewerOverlay lead={lead} viewerDocIndex={viewerDocIndex} setViewerDocIndex={setViewerDocIndex} minStmtIndex={minStmtIndex} maxStmtIndex={maxStmtIndex}/>}
      {showSettings && <SettingsModal settings={settings} setSetting={setSetting} onResetPanels={resetPanels} onClose={() => setShowSettings(false)}/>}
      <CallDock />
      {notice && <div className="forge-toast" role="status" aria-live="polite">{notice}</div>}
    </div>
  );
}
