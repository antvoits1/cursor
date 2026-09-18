import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const BRIDGE_TOKEN_KEY = 'deskphone.bridge-token';
export const BRIDGE_TOKEN_EVENT = 'deskphone:token';

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
  deviceName?: string;
  name?: string;
  number?: string;
  direction?: string;
  when?: string;
}

export interface LiveCall {
  number: string;
  deviceId: string;
  deviceName: string;
}

export type BridgeKind = 'absent' | 'reachable' | 'authed' | 'synced';

export interface PhoneBridge {
  kind: BridgeKind;
  label: string;
  mock: boolean;
  authRequired: boolean;
  hangupSupported: boolean;
  devices: BridgeDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  selectedDevice?: BridgeDevice;
  messages: BridgeMessage[];
  contacts: BridgeContact[];
  calls: BridgeCall[];
  liveCall: LiveCall | null;
  token: string;
  setToken: (value: string) => void;
  refreshNow: () => Promise<void>;
  placeCall: (number: string) => Promise<boolean>;
  hangUp: () => Promise<boolean>;
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

export function readBridgeToken(): string {
  const injected = String((window as Window & WindowBridge).IPHONELINK_TOKEN || '').trim();
  if (injected) return injected;
  try { return String(localStorage.getItem(BRIDGE_TOKEN_KEY) || '').trim(); }
  catch { return ''; }
}

export function writeBridgeToken(value: string): void {
  try { localStorage.setItem(BRIDGE_TOKEN_KEY, value.trim()); }
  catch { /* optional */ }
  window.dispatchEvent(new Event(BRIDGE_TOKEN_EVENT));
}

async function getJson(path: string, init: RequestInit = {}, needsAuth = false): Promise<Record<string, unknown> | null> {
  const headers = new Headers(init.headers);
  if (needsAuth) {
    const value = readBridgeToken();
    if (value) headers.set('X-iPhoneLink-Token', value);
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

function pick(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function normalizeDevices(payload: Record<string, unknown> | null): BridgeDevice[] {
  return asArray<Record<string, unknown>>(payload?.devices).map(item => {
    const status = pick(item, 'BluetoothConnectionStatus', 'status').toLowerCase();
    return {
      id: pick(item, 'Id', 'id'),
      name: pick(item, 'Name', 'name') || 'Phone',
      connected: status.includes('connected') || item.connected === true,
      selected: item.selected === true,
      address: pick(item, 'BluetoothAddress', 'address') || undefined,
    };
  }).filter(item => item.id);
}

function normalizeMessages(payload: Record<string, unknown> | null): BridgeMessage[] {
  return asArray<Record<string, unknown>>(payload?.messages).map(item => ({
    handle: pick(item, 'handle', 'Handle'),
    folder: pick(item, 'folder', 'Folder'),
    deviceId: pick(item, 'deviceId', 'DeviceId'),
    deviceName: pick(item, 'deviceName', 'DeviceName'),
    from: pick(item, 'from', 'From'),
    to: pick(item, 'to', 'To'),
    date: pick(item, 'date', 'Date'),
    subject: pick(item, 'subject', 'Subject'),
    body: pick(item, 'body', 'Body'),
    preview: pick(item, 'preview', 'Preview', 'body', 'Body'),
  }));
}

function normalizeCalls(payload: Record<string, unknown> | null): BridgeCall[] {
  return asArray<Record<string, unknown>>(payload?.calls).map(item => ({
    deviceId: pick(item, 'deviceId', 'DeviceId'),
    deviceName: pick(item, 'deviceName', 'DeviceName'),
    name: pick(item, 'name', 'Name'),
    number: pick(item, 'number', 'phone', 'Phone', 'Number'),
    direction: pick(item, 'direction', 'type', 'Type'),
    when: pick(item, 'when', 'timestamp', 'Timestamp', 'When'),
  }));
}

function normalizeContacts(payload: Record<string, unknown> | null): BridgeContact[] {
  return asArray<Record<string, unknown>>(payload?.contacts).map(item => ({
    deviceId: pick(item, 'deviceId', 'DeviceId'),
    deviceName: pick(item, 'deviceName', 'DeviceName'),
    name: pick(item, 'name', 'Name') || 'Unknown',
    phones: stringList(item.phones || item.Phones),
    emails: stringList(item.emails || item.Emails),
    organization: pick(item, 'organization', 'Organization') || undefined,
  }));
}

export function usePhoneBridge(): PhoneBridge {
  const [kind, setKind] = useState<BridgeKind>('absent');
  const [mock, setMock] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  const [hangupSupported, setHangupSupported] = useState(false);
  const [devices, setDevices] = useState<BridgeDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [allMessages, setAllMessages] = useState<BridgeMessage[]>([]);
  const [allContacts, setAllContacts] = useState<BridgeContact[]>([]);
  const [allCalls, setAllCalls] = useState<BridgeCall[]>([]);
  const [liveCall, setLiveCall] = useState<LiveCall | null>(null);
  const [token, setTokenState] = useState(readBridgeToken);
  const seenRef = useRef('');
  const selectedRef = useRef(selectedDeviceId);
  selectedRef.current = selectedDeviceId;
  const authRef = useRef(authRequired);
  authRef.current = authRequired;

  const setToken = useCallback((value: string) => {
    writeBridgeToken(value);
    setTokenState(value.trim());
  }, []);

  const pullExtracted = useCallback(async (needsAuth: boolean) => {
    const inbox = await getJson('/refresh-inbox?limit=250', {}, needsAuth) || await getJson('/messages?limit=250', {}, needsAuth);
    const callPayload = await getJson('/calls', {}, needsAuth);
    const contactPayload = await getJson('/contacts', {}, needsAuth);
    setAllMessages(normalizeMessages(inbox));
    setAllCalls(normalizeCalls(callPayload));
    setAllContacts(normalizeContacts(contactPayload));
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const health = await getJson('/health');
      if (!alive) return;
      if (!health) {
        setKind('absent');
        setMock(false);
        setDevices([]);
        setLiveCall(null);
        return;
      }
      const needsAuth = health.authRequired !== false;
      setAuthRequired(needsAuth);
      setMock(health.mock === true);
      setHangupSupported(health.hangup === true);
      if (needsAuth && !readBridgeToken()) {
        setKind('reachable');
        return;
      }
      const snapshot = await getJson('/devices', {}, needsAuth);
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
        await pullExtracted(needsAuth);
        if (alive) setKind('synced');
        return;
      }
      setKind(connectedKey ? 'synced' : 'authed');
    };
    void tick();
    const id = window.setInterval(() => { void tick(); }, 4000);
    const onToken = () => {
      setTokenState(readBridgeToken());
      seenRef.current = '';
      void tick();
    };
    window.addEventListener(BRIDGE_TOKEN_EVENT, onToken);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener(BRIDGE_TOKEN_EVENT, onToken);
    };
  }, [pullExtracted]);

  const refreshNow = useCallback(async () => {
    seenRef.current = '';
    const health = await getJson('/health');
    if (!health) return;
    const needsAuth = health.authRequired !== false;
    if (needsAuth && !readBridgeToken()) return;
    await pullExtracted(needsAuth);
    setKind('synced');
  }, [pullExtracted]);

  const selectedDevice = devices.find(item => item.id === selectedDeviceId);

  const filterDevice = useCallback(<T extends { deviceId?: string }>(items: T[]) => {
    if (!selectedDeviceId) return items;
    return items.filter(item => !item.deviceId || item.deviceId === selectedDeviceId);
  }, [selectedDeviceId]);

  const messages = useMemo(() => filterDevice(allMessages), [allMessages, filterDevice]);
  const contacts = useMemo(() => filterDevice(allContacts), [allContacts, filterDevice]);
  const calls = useMemo(() => filterDevice(allCalls), [allCalls, filterDevice]);

  const connectedName = devices.find(item => item.connected)?.name;
  const connectedCount = devices.filter(item => item.connected).length;
  const label = kind === 'synced'
    ? (selectedDevice?.name || connectedName || 'Phone connected') + (connectedCount > 1 ? ` · ${connectedCount} phones` : '')
    : kind === 'authed' ? 'Paired phones idle'
    : kind === 'reachable' ? (authRequired ? 'Windows bridge on, token missing' : 'Windows bridge on')
    : 'No Bluetooth phone connected';

  const placeCall = async (number: string) => {
    const payload = await getJson('/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, phone: number, device: selectedRef.current || 'selected' }),
    }, authRef.current);
    if (payload?.ok) {
      const device = devices.find(item => item.id === selectedRef.current);
      setLiveCall({
        number,
        deviceId: String(payload.deviceId || selectedRef.current || ''),
        deviceName: String(payload.device || device?.name || 'Phone'),
      });
      void pullExtracted(authRef.current);
      return true;
    }
    return false;
  };

  const hangUp = async () => {
    const payload = await getJson('/hangup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, authRef.current);
    if (payload?.ok) {
      setLiveCall(null);
      return true;
    }
    return false;
  };

  const sendSms = async (number: string, text: string) => {
    const payload = await getJson('/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: number, message: text, device: selectedRef.current || 'selected' }),
    }, authRef.current);
    if (payload?.ok) {
      await pullExtracted(authRef.current);
      return true;
    }
    return false;
  };

  return {
    kind, label, mock, authRequired, hangupSupported, devices, selectedDeviceId, setSelectedDeviceId,
    selectedDevice, messages, contacts, calls, liveCall, token, setToken, refreshNow, placeCall, hangUp, sendSms,
  };
}
