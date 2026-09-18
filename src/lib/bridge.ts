import { useEffect, useRef, useState } from 'react';

export interface BridgeDevice {
  id: string;
  name: string;
  connected: boolean;
  selected: boolean;
  address?: string;
}

export interface BridgeMessage {
  handle?: string;
  folder?: string;
  deviceId?: string;
  deviceName?: string;
  from?: string;
  to?: string;
  date?: string;
  subject?: string;
  body?: string;
  preview?: string;
}

export interface BridgeContact {
  deviceId?: string;
  deviceName?: string;
  name: string;
  phones: string[];
  emails: string[];
  organization?: string;
}

export interface BridgeCall {
  deviceId?: string;
  name?: string;
  number?: string;
  direction?: string;
  when?: string;
}

export type BridgeKind = 'absent' | 'reachable' | 'authed' | 'synced';

export interface PhoneBridge {
  kind: BridgeKind;
  label: string;
  devices: BridgeDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  messages: BridgeMessage[];
  contacts: BridgeContact[];
  calls: BridgeCall[];
  placeCall: (number: string) => Promise<boolean>;
  sendSms: (number: string, text: string) => Promise<boolean>;
}

interface WindowBridge {
  IPHONELINK_TOKEN?: string;
  IPHONELINK_BRIDGE?: string;
}

function host(): string {
  const injected = (window as Window & WindowBridge).IPHONELINK_BRIDGE;
  return (injected || 'http://127.0.0.1:8765').replace(/\/$/, '');
}

function token(): string {
  return String((window as Window & WindowBridge).IPHONELINK_TOKEN || '').trim();
}

async function getJson(path: string, init: RequestInit = {}, authed = false): Promise<Record<string, unknown> | null> {
  const headers = new Headers(init.headers);
  if (authed) {
    const value = token();
    if (!value) return null;
    headers.set('X-iPhoneLink-Token', value);
  }
  try {
    const res = await fetch(`${host()}${path}`, { ...init, headers, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeDevices(payload: Record<string, unknown> | null): BridgeDevice[] {
  return asArray<Record<string, unknown>>(payload?.devices).map(item => {
    const status = String(item.BluetoothConnectionStatus || item.status || '').toLowerCase();
    return {
      id: String(item.Id || item.id || ''),
      name: String(item.Name || item.name || 'Phone'),
      connected: status.includes('connected') || item.connected === true,
      selected: item.selected === true,
      address: item.BluetoothAddress ? String(item.BluetoothAddress) : undefined,
    };
  }).filter(item => item.id);
}

export function usePhoneBridge(): PhoneBridge {
  const [kind, setKind] = useState<BridgeKind>('absent');
  const [devices, setDevices] = useState<BridgeDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [contacts, setContacts] = useState<BridgeContact[]>([]);
  const [calls, setCalls] = useState<BridgeCall[]>([]);
  const seenRef = useRef('');

  useEffect(() => {
    let alive = true;
    const pullExtracted = async () => {
      const inbox = await getJson('/refresh-inbox?limit=250', {}, true) || await getJson('/messages?limit=250', {}, true);
      const callPayload = await getJson('/calls', {}, true);
      const contactPayload = await getJson('/contacts', {}, true);
      if (!alive) return;
      setMessages(asArray<BridgeMessage>(inbox?.messages));
      setCalls(asArray<BridgeCall>(callPayload?.calls));
      setContacts(asArray<BridgeContact>(contactPayload?.contacts).map(item => ({
        ...item,
        name: item.name || 'Unknown',
        phones: asArray<string>(item.phones),
        emails: asArray<string>(item.emails),
      })));
    };
    const tick = async () => {
      const health = await getJson('/health');
      if (!alive) return;
      if (!health) {
        setKind('absent');
        setDevices([]);
        return;
      }
      if (!token()) {
        setKind('reachable');
        return;
      }
      const snapshot = await getJson('/devices', {}, true);
      if (!alive) return;
      if (!snapshot) {
        setKind('reachable');
        return;
      }
      const nextDevices = normalizeDevices(snapshot);
      setDevices(nextDevices);
      setSelectedDeviceId(current => current && nextDevices.some(item => item.id === current)
        ? current
        : (nextDevices.find(item => item.selected)?.id || nextDevices.find(item => item.connected)?.id || nextDevices[0]?.id || ''));
      const connectedKey = nextDevices.filter(item => item.connected).map(item => item.id).sort().join('|');
      if (connectedKey && connectedKey !== seenRef.current) {
        seenRef.current = connectedKey;
        await pullExtracted();
        if (alive) setKind('synced');
        return;
      }
      setKind(connectedKey ? 'synced' : 'authed');
    };
    void tick();
    const id = window.setInterval(() => { void tick(); }, 4000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const label = kind === 'synced' ? (devices.find(item => item.connected)?.name || 'Phone connected')
    : kind === 'authed' ? 'Paired phones idle'
    : kind === 'reachable' ? 'Windows bridge on, token missing'
    : 'No Bluetooth phone connected';

  const placeCall = async (number: string) => {
    const payload = await getJson('/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, device: selectedDeviceId || 'selected' }),
    }, true);
    return Boolean(payload?.ok);
  };

  const sendSms = async (number: string, text: string) => {
    const payload = await getJson('/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: number, message: text, device: selectedDeviceId || 'selected' }),
    }, true);
    return Boolean(payload?.ok);
  };

  return { kind, label, devices, selectedDeviceId, setSelectedDeviceId, messages, contacts, calls, placeCall, sendSms };
}
