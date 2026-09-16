import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Grid3x3, Delete, Building2, Smartphone, ChevronDown } from 'lucide-react';
import { useStore } from '../store';
import { telephony } from '../lib/telephony';
import { digitsOnly } from '../lib/comm';

interface Props {
  variant: 'topbar' | 'sidebar';
  light: boolean;
  isWide?: boolean;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// Format a raw dial string for display without changing what gets dialed.
// Uses Inter (no monospace) — grouping only, US-style when it looks like one.
function formatDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (hasPlus || digits.length > 11) return trimmed;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return digits;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TopbarDialer({ variant, light, isWide = false }: Props) {
  const { callState, setCallState, leads } = useStore();
  const [elapsed, setElapsed] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = callState.status !== 'idle';
  const connected = callState.status === 'connected';

  // Probe backend configuration once so the UI can show an honest state.
  useEffect(() => { telephony.refreshConfigured(); }, []);

  useEffect(() => {
    let timer: number | undefined;
    if (connected && callState.startTime) {
      const tick = () => setElapsed(Math.floor((Date.now() - callState.startTime!) / 1000));
      tick();
      timer = window.setInterval(tick, 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [connected, callState.startTime]);

  useEffect(() => {
    if (!active) { setShowKeypad(false); setShowLines(false); }
  }, [active]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setShowKeypad(false);
        setShowLines(false);
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const setDial = (next: string) => setCallState({ dialString: next, error: undefined });

  const placeCall = async () => {
    const raw = callState.dialString.trim();
    const number = digitsOnly(raw);
    if (!number) { inputRef.current?.focus(); return; }

    const lead = leads.find(l => l.mobiles?.some(m => digitsOnly(m.n) === number) || l.landlines?.some(m => digitsOnly(m.n) === number));
    setCallState({ status: 'ringing', number: raw, leadId: lead?.id, isMuted: false, isOnHold: false, error: undefined });

    const result = await telephony.placeCall(number);
    if (!result.configured) {
      if (result.handedOff) {
        // A native shell (Electron/mobile) took over the call — clear our state.
        useStore.getState().endCall();
      } else {
        setCallState({ status: 'idle', error: 'Connect Twilio to place calls (see README).' });
      }
    }
    // When configured, the Twilio "accept"/"disconnect" events drive the store.
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); placeCall(); }
  };

  const endCall = () => telephony.hangup();
  const toggleMute = () => telephony.setMuted(!callState.isMuted);
  const toggleHold = () => telephony.setHold(!callState.isOnHold);
  const pressDtmf = (digit: string) => telephony.sendDigits(digit);

  const lead = leads.find(l => l.id === callState.leadId);
  const displayName = lead ? lead.contact : (formatDisplay(callState.number) || 'Unknown');
  const displaySub = connected ? formatElapsed(elapsed) : 'Ringing…';

  const idleField = (
    <div className="forge-dialer-entry">
      <span className="forge-dialer-icon" aria-hidden="true"><Phone size={15} strokeWidth={1.9} /></span>
      <input
        ref={inputRef}
        className="forge-dialer-input"
        type="tel"
        inputMode="tel"
        placeholder="Enter a number"
        aria-label="Phone number to dial"
        value={formatDisplay(callState.dialString)}
        onChange={e => setDial(e.target.value.replace(/[^\d+*#\s()-]/g, ''))}
        onKeyDown={onKeyDown}
      />
      {callState.dialString && (
        <button type="button" className="forge-dialer-erase" onClick={() => setDial(callState.dialString.slice(0, -1))} title="Delete" aria-label="Delete last digit">
          <Delete size={15} strokeWidth={1.9} />
        </button>
      )}
    </div>
  );

  const callButton = (
    <button type="button" className="forge-dialer-call" onClick={placeCall} title="Call" aria-label="Place call">
      <Phone size={17} strokeWidth={2} />
    </button>
  );

  const activeControls = (
    <div className="forge-dialer-live">
      <div className="forge-dialer-live-info">
        <span className="forge-dialer-live-name">{displayName}</span>
        <span className={`forge-dialer-live-sub ${connected ? '' : 'ringing'}`}>{displaySub}</span>
      </div>
      <div className="forge-dialer-live-controls">
        <button type="button" className={`forge-dialer-ctrl ${callState.isMuted ? 'on' : ''}`} onClick={toggleMute} title={callState.isMuted ? 'Unmute' : 'Mute'} aria-label={callState.isMuted ? 'Unmute' : 'Mute'}>
          {callState.isMuted ? <MicOff size={16} strokeWidth={1.9} /> : <Mic size={16} strokeWidth={1.9} />}
        </button>
        <button type="button" className={`forge-dialer-ctrl ${callState.isOnHold ? 'on' : ''}`} onClick={toggleHold} title={callState.isOnHold ? 'Resume' : 'Hold'} aria-label={callState.isOnHold ? 'Resume' : 'Hold'} disabled={!connected}>
          {callState.isOnHold ? <Play size={16} strokeWidth={1.9} /> : <Pause size={16} strokeWidth={1.9} />}
        </button>
        <button type="button" className={`forge-dialer-ctrl ${showKeypad ? 'on' : ''}`} onClick={() => { setShowKeypad(v => !v); setShowLines(false); }} title="Keypad" aria-label="Keypad" disabled={!connected}>
          <Grid3x3 size={16} strokeWidth={1.9} />
        </button>
        <div className="forge-dialer-line-wrap">
          <button type="button" className={`forge-dialer-ctrl ${showLines ? 'on' : ''}`} onClick={() => { setShowLines(v => !v); setShowKeypad(false); }} title="Switch line" aria-label="Switch line">
            {callState.activeLine === 'office' ? <Building2 size={16} strokeWidth={1.9} /> : <Smartphone size={16} strokeWidth={1.9} />}
            <ChevronDown size={11} strokeWidth={2} />
          </button>
          {showLines && (
            <div className="forge-dialer-menu">
              <button type="button" className={callState.activeLine === 'office' ? 'sel' : ''} onClick={() => { setCallState({ activeLine: 'office' }); setShowLines(false); }}>
                <Building2 size={14} strokeWidth={1.9} /> Office line
              </button>
              <button type="button" className={callState.activeLine === 'personal' ? 'sel' : ''} onClick={() => { setCallState({ activeLine: 'personal' }); setShowLines(false); }}>
                <Smartphone size={14} strokeWidth={1.9} /> Personal iPhone
              </button>
            </div>
          )}
        </div>
        <button type="button" className="forge-dialer-end" onClick={endCall} title="End call" aria-label="End call">
          <PhoneOff size={16} strokeWidth={2} />
        </button>
      </div>
      {showKeypad && (
        <div className="forge-dialer-tones">
          {KEYPAD.map(key => (
            <button key={key} type="button" onClick={() => pressDtmf(key)}>{key}</button>
          ))}
        </div>
      )}
    </div>
  );

  // ---- Topbar variant: embedded inline in the nav ----
  if (variant === 'topbar') {
    return (
      <div ref={rootRef} className={`forge-dialer topbar ${light ? 'light' : 'dark'} ${active ? 'active' : 'idle'}`}>
        {active ? activeControls : (
          <>
            {idleField}
            {callButton}
          </>
        )}
        {!active && callState.error && <div className="forge-dialer-hint" role="status">{callState.error}</div>}
        {!active && !callState.error && !callState.configured && (
          <div className="forge-dialer-status" title="Add Twilio credentials to place live calls">Twilio not connected</div>
        )}
      </div>
    );
  }

  // ---- Sidebar variant: compact green button + popover ----
  return (
    <div ref={rootRef} className="forge-dialer-side-wrap">
      {active ? (
        <div className={`forge-dialer sidebar ${light ? 'light' : 'dark'} active`}>{activeControls}</div>
      ) : (
        <>
          <button type="button" className={`forge-side-tab forge-dialer-side-btn ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(v => !v)} title="Dialer" aria-label="Dialer" aria-expanded={sidebarOpen}>
            <span className="forge-dialer-side-dot"><Phone size={19} strokeWidth={1.7} /></span>{isWide && <span>Dialer</span>}
          </button>
          {sidebarOpen && (
            <div className={`forge-dialer sidebar-pop ${light ? 'light' : 'dark'}`}>
              {idleField}
              <div className="forge-dialer-pad">
                {KEYPAD.map(key => (
                  <button key={key} type="button" onClick={() => setDial(callState.dialString + key)}>{key}</button>
                ))}
              </div>
              <div className="forge-dialer-pop-actions">
                {callButton}
              </div>
              {callState.error && <div className="forge-dialer-hint" role="status">{callState.error}</div>}
              {!callState.error && !callState.configured && <div className="forge-dialer-status">Twilio not connected</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
