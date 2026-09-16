import twilio from 'twilio';

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

// Mints a short-lived Twilio Voice access token for the browser SDK.
//
// Reads credentials from the environment. If any required variable is missing
// we intentionally return HTTP 200 with `{ configured: false }` (NOT a 500) so
// the UI can show an honest "Connect Twilio to place calls" state instead of
// erroring out.
export function buildTokenPayload() {
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

export default function handler(req, res) {
  const payload = buildTokenPayload();
  res.status(200).json(payload);
}
