/**
 * Truthful classification of anti-bot responses. The engine never claims a
 * challenge was solved or bypassed — it records what was observed and moves to
 * the next legitimate route.
 */

export interface ContentVerdict {
  blocked: boolean;
  /** Name of the challenge system when one is positively identified. */
  challenge?: string;
  /** Short reason suitable for showing to an operator. */
  reason?: string;
  /** True when the body is a JavaScript shell with no server-rendered content. */
  dynamicShell: boolean;
  visibleChars: number;
}

export const BLOCK_STATUSES = new Set([401, 403, 405, 406, 409, 429, 451, 503]);

const CHALLENGE_SIGNATURES: Array<{ name: string; markers: string[] }> = [
  { name: 'Cloudflare Turnstile', markers: ['cf-turnstile', 'turnstile.js', 'challenges.cloudflare.com/turnstile'] },
  { name: 'Cloudflare interstitial', markers: ['cf-chl-', 'challenge-platform', 'cf_chl_opt', 'just a moment...', 'checking your browser before accessing'] },
  { name: 'Google reCAPTCHA', markers: ['g-recaptcha', 'grecaptcha.execute', 'recaptcha/api.js'] },
  { name: 'hCaptcha', markers: ['h-captcha', 'hcaptcha.com/1/api.js'] },
  { name: 'PerimeterX', markers: ['_pxhd', 'px-captcha', 'perimeterx'] },
  { name: 'DataDome', markers: ['datadome', 'dd_cookie_test'] },
  { name: 'Akamai Bot Manager', markers: ['_abck', 'akam-sw.js'] },
  { name: 'Imperva / Incapsula', markers: ['incapsula incident id', '_incapsula_resource'] },
  { name: 'Generic browser verification', markers: ['verify you are human', 'verification required', 'enable javascript and cookies to continue', 'please verify you are a human'] },
];

const JS_SHELL_MARKERS = [
  '<div id="root"></div>',
  "<div id='root'></div>",
  '<div id="app"></div>',
  "<div id='app'></div>",
  '<div id="__next"></div>',
  'please enable javascript to run this app',
  'you need to enable javascript to run this app',
];

export function visibleTextLength(html: string): number {
  const stripped = (html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return stripped.replace(/\s+/g, '').length;
}

export function classifyContent(html: string, status?: number): ContentVerdict {
  const body = html || '';
  const lowered = body.toLowerCase();
  const visibleChars = visibleTextLength(body);

  for (const signature of CHALLENGE_SIGNATURES) {
    const hit = signature.markers.find((m) => lowered.includes(m));
    if (hit) {
      return {
        blocked: true,
        challenge: signature.name,
        reason: `${signature.name} challenge was present on the page.`,
        dynamicShell: false,
        visibleChars,
      };
    }
  }

  if (typeof status === 'number' && BLOCK_STATUSES.has(status)) {
    return {
      blocked: true,
      reason: `The server answered HTTP ${status}, which indicates a block or rate limit.`,
      dynamicShell: false,
      visibleChars,
    };
  }

  const hasShellMarker = JS_SHELL_MARKERS.some((m) => lowered.includes(m));
  const scriptHeavy = lowered.includes('<script') && visibleChars < 140;
  const dynamicShell = (hasShellMarker && visibleChars < 220) || (body.length < 1200 && scriptHeavy);

  return { blocked: false, dynamicShell, visibleChars };
}
