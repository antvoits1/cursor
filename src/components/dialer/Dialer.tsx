import { useEffect, useRef, useState } from 'react';
import { devices } from '../../data/devices';
import { formatDialInput } from '../../lib/dialer';
import { formatClock } from '../../lib/format';
import { useCrm } from '../../state/CrmContext';
import { Icon } from '../Icon';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function Dialer() {
  const {
    dialer,
    connectedDeviceName,
    setDialNumber,
    appendDialDigit,
    backspaceDialDigit,
    startCall,
    markCallActive,
    endCall,
    toggleMute,
    toggleKeypad,
    toggleDevicePop,
    selectDevice,
  } = useCrm();

  const [seconds, setSeconds] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Ringing → connected transition.
  useEffect(() => {
    if (dialer.status !== 'dialing') return;
    const t = window.setTimeout(() => {
      markCallActive();
      setSeconds(0);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [dialer.status, markCallActive]);

  // Call timer.
  useEffect(() => {
    if (dialer.status !== 'active') return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [dialer.status]);

  // Close popovers on outside click.
  useEffect(() => {
    if (!dialer.keypadOpen && !dialer.devicePopOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (dialer.keypadOpen) toggleKeypad();
        if (dialer.devicePopOpen) toggleDevicePop();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dialer.keypadOpen, dialer.devicePopOpen, toggleKeypad, toggleDevicePop]);

  const inCall = dialer.status !== 'idle';
  const displayNumber = formatDialInput(dialer.number);

  const onInputChange = (raw: string) => {
    if (raw === '' || /[\d()+*\-\s#]$/.test(raw)) setDialNumber(raw);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && dialer.status === 'idle') startCall();
  };

  return (
    <div className="dialer" ref={rootRef}>
      <div className="dialer-inner">
        <div className="dialer-device-wrap">
          <button
            type="button"
            className="dialer-device"
            onClick={toggleDevicePop}
            title="Connected phone"
            aria-expanded={dialer.devicePopOpen}
          >
            <span className="dialer-device-dot connected" />
            <span className="dialer-device-name">{connectedDeviceName}</span>
            <Icon name="chevronDown" size={11} />
          </button>
          {dialer.devicePopOpen && (
            <div className="dialer-pop dialer-devices-pop">
              {devices.map((dev) => (
                <button
                  key={dev.id}
                  type="button"
                  className={`device-option${dev.id === dialer.deviceId ? ' active' : ''}`}
                  onClick={() => selectDevice(dev.id)}
                >
                  <Icon name="phone" size={14} />
                  <span className="device-option-main">
                    <span className="device-name">{dev.name}</span>
                    <span className="device-state">
                      {dev.id === dialer.deviceId ? 'Connected' : 'Available'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="dialer-sep" />

        <div className="dialer-field">
          <input
            className={`dialer-input${inCall ? ' live' : ''}`}
            value={inCall && dialer.tones ? `${displayNumber} ${dialer.tones}` : displayNumber}
            placeholder="Enter number"
            aria-label="Dial number"
            readOnly={inCall}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          {dialer.status === 'dialing' && <span className="dialer-timer">Calling…</span>}
          {dialer.status === 'active' && (
            <span className="dialer-timer">{formatClock(seconds)}</span>
          )}
        </div>

        {!inCall && dialer.number.length > 0 && (
          <button
            type="button"
            className="dialer-btn"
            onClick={backspaceDialDigit}
            title="Delete digit"
            aria-label="Delete digit"
          >
            <Icon name="delete" size={13} />
          </button>
        )}

        {inCall && (
          <button
            type="button"
            className={`dialer-btn${dialer.muted ? ' on' : ''}`}
            onClick={toggleMute}
            title={dialer.muted ? 'Unmute' : 'Mute'}
            aria-label={dialer.muted ? 'Unmute' : 'Mute'}
          >
            <Icon name={dialer.muted ? 'micOff' : 'mic'} size={13} />
          </button>
        )}

        <button
          type="button"
          className={`dialer-btn${dialer.keypadOpen ? ' on' : ''}`}
          onClick={toggleKeypad}
          title="Keypad"
          aria-label="Keypad"
          aria-expanded={dialer.keypadOpen}
        >
          <Icon name="keypad" size={13} />
        </button>

        {dialer.status === 'idle' ? (
          <button
            type="button"
            className="dialer-call"
            onClick={startCall}
            disabled={dialer.number.length < 3}
            title="Call"
            aria-label="Call"
          >
            <Icon name="call" size={13} />
          </button>
        ) : (
          <button
            type="button"
            className="dialer-call end"
            onClick={() => {
              endCall(dialer.status === 'active' ? seconds : 0);
              setSeconds(0);
            }}
            title="End call"
            aria-label="End call"
          >
            <Icon name="phoneOff" size={13} />
          </button>
        )}

        {dialer.keypadOpen && (
          <div className="dialer-pop dialer-keypad-pop">
            <div className="dialer-keypad">
              {KEYPAD_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="dialer-key"
                  onClick={() => appendDialDigit(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
