import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { Phone, Mic, MicOff, Pause, Play, PhoneOff, Grid, Smartphone, Building2, ChevronDown, CornerUpRight } from 'lucide-react';

export default function CallDock() {
  const { callState, setCallState, endCall, leads } = useStore();
  const [elapsed, setElapsed] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showLineSwitcher, setShowLineSwitcher] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: number;
    if (callState.status === 'connected' && callState.startTime) {
      interval = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - callState.startTime!) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [callState.status, callState.startTime]);

  useEffect(() => {
    if (callState.status === 'idle') {
      setShowKeypad(false);
      setShowLineSwitcher(false);
    }
  }, [callState.status]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setShowKeypad(false);
        setShowLineSwitcher(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (callState.status === 'idle') return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const lead = leads.find(l => l.id === callState.leadId);
  const displayName = lead ? lead.contact : callState.number;
  const displayCompany = lead ? lead.company : 'Unknown';

  return (
    <div ref={dockRef} className="call-dock-container" style={{
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      <div className="call-dock-pill" style={{
        display: 'flex',
        alignItems: 'center',
        background: '#FFFFFF',
        borderRadius: '9px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        border: '1px solid #E2E6F0',
        padding: '8px 12px',
        gap: '16px',
        fontFamily: 'var(--font-family-main)',
        zIndex: 9999
      }}>
        {/* Info Section */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1E2235' }}>{displayName}</span>
          <span style={{ fontSize: '12px', color: '#5A6078' }}>
            {callState.status === 'ringing' ? 'Ringing...' : formatTime(elapsed)}
          </span>
        </div>

        {/* Line Switcher */}
        <div style={{ position: 'relative' }}>
          <button 
            type="button"
            onClick={() => {
              setShowLineSwitcher(!showLineSwitcher);
              setShowKeypad(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#5A6078',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
            title="Switch Line"
          >
            {callState.activeLine === 'office' ? <Building2 size={16} /> : <Smartphone size={16} />}
            <ChevronDown size={12} />
          </button>
          
          {showLineSwitcher && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: '8px',
              background: '#FFFFFF',
              border: '1px solid #E2E6F0',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              minWidth: '140px'
            }}>
              <button
                type="button"
                onClick={() => { setCallState({ activeLine: 'office' }); setShowLineSwitcher(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  background: callState.activeLine === 'office' ? '#F2F4F8' : 'transparent',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left',
                  fontSize: '13px', color: '#1E2235'
                }}
              >
                <Building2 size={14} /> Office Line
              </button>
              <button
                type="button"
                onClick={() => { setCallState({ activeLine: 'personal' }); setShowLineSwitcher(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  background: callState.activeLine === 'personal' ? '#F2F4F8' : 'transparent',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left',
                  fontSize: '13px', color: '#1E2235'
                }}
              >
                <Smartphone size={14} /> Personal iPhone
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setCallState({ isMuted: !callState.isMuted })}
            style={{
              width: '36px', height: '36px', borderRadius: '50%', border: 'none',
              background: callState.isMuted ? '#F2F4F8' : 'transparent',
              color: callState.isMuted ? '#1E2235' : '#5A6078',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title={callState.isMuted ? 'Unmute' : 'Mute'}
          >
            {callState.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            type="button"
            onClick={() => setCallState({ isOnHold: !callState.isOnHold })}
            style={{
              width: '36px', height: '36px', borderRadius: '50%', border: 'none',
              background: callState.isOnHold ? '#F2F4F8' : 'transparent',
              color: callState.isOnHold ? '#1E2235' : '#5A6078',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title={callState.isOnHold ? 'Resume' : 'Hold'}
          >
            {callState.isOnHold ? <Play size={18} /> : <Pause size={18} />}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowKeypad(!showKeypad);
              setShowLineSwitcher(false);
            }}
            style={{
              width: '36px', height: '36px', borderRadius: '50%', border: 'none',
              background: showKeypad ? '#F2F4F8' : 'transparent',
              color: showKeypad ? '#1E2235' : '#5A6078',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title="Keypad"
          >
            <Grid size={18} />
          </button>

          <button
            type="button"
            onClick={endCall}
            style={{
              width: '36px', height: '36px', borderRadius: '50%', border: 'none',
              background: '#EF4444', color: '#FFFFFF',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: '8px'
            }}
            title="End Call"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>

      {/* Keypad Pop-down */}
      {showKeypad && (
        <div className="call-dock-keypad" style={{
          background: '#FFFFFF',
          borderRadius: '9px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: '1px solid #E2E6F0',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '220px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(key => (
              <button
                key={key}
                type="button"
                style={{
                  background: '#F2F4F8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px 0',
                  fontSize: '18px',
                  fontWeight: 500,
                  color: '#1E2235',
                  cursor: 'pointer'
                }}
              >
                {key}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #E2E6F0', paddingTop: '12px', display: 'flex', justifyContent: 'center' }}>
            <button type="button" style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'transparent', border: 'none', color: '#5A6078',
              fontSize: '14px', cursor: 'pointer'
            }}>
              <CornerUpRight size={16} /> Transfer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
