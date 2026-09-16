import express from 'express';
import twilio from 'twilio';

// Tiny standalone token server for LOCAL development. On Vercel the serverless
// handler in `api/token.js` serves the same route; this express server mirrors
// it so `npm run token-server` works alongside `npm run dev`.
//
// Missing credentials => HTTP 200 `{ configured: false }` (never a 500) so the
// dialer can render its honest not-configured state.

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const PORT = Number(process.env.TOKEN_SERVER_PORT || 3001);

function buildTokenPayload() {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY,
    TWILIO_API_SECRET,
    TWILIO_TWIML_APP_SID,
    TWILIO_CALLER_ID,
  } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET || !TWILIO_TWIML_APP_SID) {
    return { configured: false };
  }

  const identity = process.env.TWILIO_IDENTITY || 'forge-agent';
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity,
    ttl: 3600,
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID,
      incomingAllow: true,
    }),
  );

  return {
    configured: true,
    token: token.toJwt(),
    identity,
    callerId: TWILIO_CALLER_ID || '',
  };
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.all('/api/token', (_req, res) => {
  res.status(200).json(buildTokenPayload());
});

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.listen(PORT, () => {
  const ready = buildTokenPayload().configured;
  console.log(`[token-server] listening on http://localhost:${PORT}/api/token`);
  console.log(`[token-server] Twilio configured: ${ready ? 'yes' : 'no (set TWILIO_* env vars)'}`);
});
