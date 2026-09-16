import { Call, Device } from '@twilio/voice-sdk';
import { useStore } from '../store';
import { digitsOnly } from './comm';

// Real Twilio Voice (WebRTC) adapter.
//
// This module talks to a backend token endpoint (`/api/token`) that mints a
// short-lived Twilio access token. With a valid token it lazily creates a
// Twilio `Device`, registers it, and places/controls real WebRTC calls. When
// the backend is not configured (missing Twilio credentials) the endpoint
// returns `{ configured: false }` and we surface that honestly to the UI while
// still supporting the legacy handoff paths (`window.ForgeTelephonyAdapter`
// and the `forge:call-request` CustomEvent) used by Electron / mobile shells.

export interface TokenResponse {
  token?: string;
  identity?: string;
  callerId?: string;
  configured?: boolean;
}

export interface PlaceCallResult {
  call: Call | null;
  configured: boolean;
  handedOff: boolean;
}

interface ForgeTelephonyAdapter {
  startCall?: (payload: { number: string; leadId?: string }) => Promise<void> | void;
}

type TelephonyWindow = Window & { ForgeTelephonyAdapter?: ForgeTelephonyAdapter };

const TOKEN_ENDPOINT = '/api/token';

class Telephony {
  private device: Device | null = null;
  private activeCall: Call | null = null;
  private setupPromise: Promise<boolean> | null = null;

  /** True once a Twilio Device has registered successfully. */
  configured = false;
  /** Caller ID handed back by the token endpoint (verified/purchased number). */
  defaultCallerId = '';

  private patchState(update: Parameters<ReturnType<typeof useStore.getState>['setCallState']>[0]) {
    useStore.getState().setCallState(update);
  }

  /** Fetch a fresh Twilio access token from the backend. */
  async getToken(): Promise<TokenResponse> {
    // POST first (matches the serverless handler); fall back to GET.
    for (const method of ['POST', 'GET'] as const) {
      try {
        const res = await fetch(TOKEN_ENDPOINT, {
          method,
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) continue;
        const data = (await res.json()) as TokenResponse;
        return data;
      } catch {
        // Network / endpoint missing — try the next method, then give up.
      }
    }
    return { configured: false };
  }

  /**
   * Lazily create and register a Twilio Device. Resolves to `true` when a live
   * device is ready, `false` when Twilio is not configured.
   */
  private async ensureDevice(): Promise<boolean> {
    if (this.device) return this.configured;
    if (this.setupPromise) return this.setupPromise;

    this.setupPromise = (async () => {
      const data = await this.getToken();
      if (!data || data.configured === false || !data.token) {
        this.configured = false;
        this.patchState({ configured: false });
        return false;
      }

      this.defaultCallerId = data.callerId || '';
      const device = new Device(data.token, {
        logLevel: 'error',
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      device.on('registered', () => {
        this.configured = true;
        this.patchState({ configured: true, error: undefined });
      });
      device.on('error', (err: { message?: string }) => {
        this.patchState({ error: err?.message || 'Twilio device error' });
      });
      device.on('tokenWillExpire', async () => {
        const refreshed = await this.getToken();
        if (refreshed.token) device.updateToken(refreshed.token);
      });

      try {
        await device.register();
      } catch (err) {
        this.configured = false;
        this.patchState({ configured: false, error: (err as Error)?.message || 'Registration failed' });
        return false;
      }

      this.device = device;
      this.configured = true;
      this.patchState({ configured: true });
      return true;
    })();

    const ready = await this.setupPromise;
    this.setupPromise = null;
    return ready;
  }

  /** Wire call lifecycle events into the store. */
  private bindCall(call: Call) {
    call.on('accept', () => this.patchState({ status: 'connected', startTime: Date.now(), error: undefined }));
    call.on('disconnect', () => { this.activeCall = null; useStore.getState().endCall(); });
    call.on('cancel', () => { this.activeCall = null; useStore.getState().endCall(); });
    call.on('reject', () => { this.activeCall = null; useStore.getState().endCall(); });
    call.on('error', (err: { message?: string }) => this.patchState({ error: err?.message || 'Call error' }));
  }

  /** Legacy handoff for Electron / mobile shells when Twilio isn't configured. */
  private handOff(number: string, leadId?: string): boolean {
    const clean = digitsOnly(number);
    const payload = { number: clean, leadId };
    const adapter = (window as TelephonyWindow).ForgeTelephonyAdapter;
    if (adapter?.startCall) {
      try {
        void adapter.startCall(payload);
        return true;
      } catch {
        return false;
      }
    }
    const event = new CustomEvent('forge:call-request', { detail: payload, cancelable: true });
    // `dispatchEvent` returns false when a listener called preventDefault (handled).
    return !window.dispatchEvent(event);
  }

  /**
   * Place a real outbound call. Falls back to the legacy handoff when Twilio is
   * not configured. `leadId` is read from the store's current call state so the
   * handoff payload matches the existing `forge:call-request` contract.
   */
  async placeCall(number: string, callerId?: string): Promise<PlaceCallResult> {
    const ready = await this.ensureDevice();
    if (!ready || !this.device) {
      const leadId = useStore.getState().callState.leadId;
      const handedOff = this.handOff(number, leadId);
      return { call: null, configured: false, handedOff };
    }

    const params: Record<string, string> = { To: number };
    const cid = callerId || this.defaultCallerId;
    if (cid) params.CallerId = cid;

    const call = await this.device.connect({ params });
    this.bindCall(call);
    this.activeCall = call;
    return { call, configured: true, handedOff: false };
  }

  /** Mute / unmute the live call. */
  setMuted(muted: boolean) {
    this.activeCall?.mute(muted);
    this.patchState({ isMuted: muted });
  }

  /**
   * The Twilio JS Voice SDK has no first-class "hold" primitive (there is no
   * server-side re-INVITE from the client). We approximate hold by muting the
   * microphone and flagging the UI. This is an HONEST hold: the caller can no
   * longer hear the agent, but inbound audio is not truly parked on a hold
   * queue. Proper hold requires a TwiML `<Enqueue>`/`<Conference>` move on the
   * server; that seam is intentionally left for the backend webhook.
   */
  setHold(hold: boolean) {
    this.activeCall?.mute(hold);
    this.patchState({ isOnHold: hold });
  }

  /** Send DTMF tones on the live call. */
  sendDigits(digits: string) {
    this.activeCall?.sendDigits(digits);
  }

  /** Hang up the live call (if any). The store is cleared via the disconnect event. */
  hangup() {
    if (this.activeCall) {
      this.activeCall.disconnect();
      this.activeCall = null;
    } else {
      useStore.getState().endCall();
    }
  }

  /** Probe backend configuration without creating a Device (used for UI hints). */
  async refreshConfigured(): Promise<boolean> {
    const data = await this.getToken();
    const configured = !!data.token && data.configured !== false;
    this.configured = configured;
    if (data.callerId) this.defaultCallerId = data.callerId;
    this.patchState({ configured });
    return configured;
  }
}

export const telephony = new Telephony();
