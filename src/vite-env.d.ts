/// <reference types="vite/client" />

interface ForgeTelephonyAdapter {
  startCall?: (payload: { number: string; leadId?: string }) => Promise<void> | void;
}

interface Window {
  ForgeTelephonyAdapter?: ForgeTelephonyAdapter;
  IPHONELINK_TOKEN?: string;
  IPHONELINK_BRIDGE?: string;
}
