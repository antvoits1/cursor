import http from 'node:http';

const PORT = Number(process.env.PHONE_BRIDGE_PORT || 8765);
const PHONE_A = {
  Id: 'bt-phone-a',
  Name: 'iPhone',
  BluetoothAddress: 'F4:0F:24:11:AA:01',
  BluetoothConnectionStatus: 'Connected',
  EffectiveIsPaired: true,
  selected: true,
  sendCount: 0,
};
const PHONE_B = {
  Id: 'bt-phone-b',
  Name: 'Pixel 8',
  BluetoothAddress: '3C:28:6D:22:BB:02',
  BluetoothConnectionStatus: 'Connected',
  EffectiveIsPaired: true,
  selected: false,
  sendCount: 0,
};

const devices = [PHONE_A, PHONE_B];
let selectedId = PHONE_A.Id;
const calls = [
  { deviceId: PHONE_A.Id, deviceName: PHONE_A.Name, type: 'incoming', name: 'Alex Rivera', phone: '+14155550164', timestamp: '10m ago' },
  { deviceId: PHONE_A.Id, deviceName: PHONE_A.Name, type: 'outgoing', name: 'Priya Shah', phone: '+19255550119', timestamp: '1h ago' },
  { deviceId: PHONE_B.Id, deviceName: PHONE_B.Name, type: 'missed', name: 'Nate Brooks', phone: '+16285550134', timestamp: '25m ago' },
  { deviceId: PHONE_B.Id, deviceName: PHONE_B.Name, type: 'outgoing', name: 'Mei Chen', phone: '+15105550176', timestamp: '3h ago' },
];
const contacts = [
  { deviceId: PHONE_A.Id, deviceName: PHONE_A.Name, name: 'Alex Rivera', phones: ['+14155550164'], emails: ['alex.rivera@example.com'], organization: '' },
  { deviceId: PHONE_A.Id, deviceName: PHONE_A.Name, name: 'Priya Shah', phones: ['+19255550119', '+19255550120'], emails: ['priya.shah@example.com'], organization: 'Hayes Dental' },
  { deviceId: PHONE_B.Id, deviceName: PHONE_B.Name, name: 'Nate Brooks', phones: ['+16285550134'], emails: [], organization: '' },
  { deviceId: PHONE_B.Id, deviceName: PHONE_B.Name, name: 'Mei Chen', phones: ['+15105550176'], emails: ['mei.chen@example.com'], organization: '' },
];
const messages = [
  { Handle: 'a1', Folder: 'telecom/msg/inbox', DeviceId: PHONE_A.Id, DeviceName: PHONE_A.Name, Type: 'SMS', Status: 'read', From: '+14155550164', To: '', Date: '8m ago', Subject: '', Body: 'On site in ten.', Preview: 'On site in ten.' },
  { Handle: 'a2', Folder: 'telecom/msg/sent', DeviceId: PHONE_A.Id, DeviceName: PHONE_A.Name, Type: 'SMS', Status: 'sent', From: '', To: '+14155550164', Date: '12m ago', Subject: '', Body: 'Loading dock B is open.', Preview: 'Loading dock B is open.' },
  { Handle: 'b1', Folder: 'telecom/msg/inbox', DeviceId: PHONE_B.Id, DeviceName: PHONE_B.Name, Type: 'SMS', Status: 'read', From: '+16285550134', To: '', Date: '20m ago', Subject: '', Body: 'Need the LUT from Friday.', Preview: 'Need the LUT from Friday.' },
  { Handle: 'b2', Folder: 'telecom/msg/sent', DeviceId: PHONE_B.Id, DeviceName: PHONE_B.Name, Type: 'SMS', Status: 'sent', From: '', To: '+15105550176', Date: '1h ago', Subject: '', Body: 'Sunday dumplings at 6?', Preview: 'Sunday dumplings at 6?' },
];
let liveCall = null;

function json(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-iPhoneLink-Token, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

function pickDevice(payload) {
  const requested = String(payload.device || payload.deviceMode || payload.deviceId || selectedId);
  return devices.find(item => item.Id === requested) || devices.find(item => item.Id === selectedId) || devices[0];
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 200, { ok: true });
    return;
  }
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (path === '/health' || path === '/') {
    json(res, 200, {
      ok: true,
      app: 'Desk Phone mock bridge',
      mock: true,
      authRequired: false,
      connectedPhones: devices.filter(item => /connected/i.test(item.BluetoothConnectionStatus)).length,
      hangup: true,
    });
    return;
  }
  if (path === '/devices') {
    json(res, 200, {
      ok: true,
      deviceCount: devices.length,
      devices: devices.map(item => ({ ...item, selected: item.Id === selectedId })),
    });
    return;
  }
  if (path === '/messages' || path === '/refresh-inbox') {
    json(res, 200, { ok: true, count: messages.length, messages });
    return;
  }
  if (path === '/calls') {
    json(res, 200, { ok: true, count: calls.length, calls });
    return;
  }
  if (path === '/contacts') {
    json(res, 200, { ok: true, count: contacts.length, contacts });
    return;
  }
  if (path === '/call' && req.method === 'POST') {
    const payload = await readBody(req);
    const phone = String(payload.phone || payload.number || '');
    const device = pickDevice(payload);
    if (!phone) { json(res, 200, { ok: false, error: 'phone is required' }); return; }
    selectedId = device.Id;
    liveCall = { phone, deviceId: device.Id, deviceName: device.Name };
    calls.unshift({ deviceId: device.Id, deviceName: device.Name, type: 'outgoing', name: phone, phone, timestamp: 'just now' });
    json(res, 200, { ok: true, status: 'Call Started', device: device.Name, deviceId: device.Id });
    return;
  }
  if (path === '/hangup' && req.method === 'POST') {
    const ended = liveCall;
    liveCall = null;
    json(res, 200, { ok: true, status: 'Call Ended', device: ended?.deviceName || null });
    return;
  }
  if (path === '/send-sms' && req.method === 'POST') {
    const payload = await readBody(req);
    const phone = String(payload.phone || payload.to || '');
    const body = String(payload.message || payload.body || '');
    const device = pickDevice(payload);
    if (!phone || !body) { json(res, 200, { ok: false, error: 'phone and message are required' }); return; }
    selectedId = device.Id;
    device.sendCount += 1;
    messages.unshift({
      Handle: `out-${Date.now()}`,
      Folder: 'telecom/msg/sent',
      DeviceId: device.Id,
      DeviceName: device.Name,
      Type: 'SMS',
      Status: 'sent',
      From: '',
      To: phone,
      Date: 'just now',
      Subject: '',
      Body: body,
      Preview: body.slice(0, 160),
    });
    json(res, 200, { ok: true, device: device.Name, deviceId: device.Id });
    return;
  }

  json(res, 404, { ok: false, error: 'Unknown endpoint.' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Desk Phone mock bridge on http://127.0.0.1:${PORT}/ with 2 connected phones`);
});
