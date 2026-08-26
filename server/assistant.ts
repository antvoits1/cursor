import type { AssistantUsage } from '../src/types.js';

/**
 * Optional language-model layer.
 *
 * Two jobs, and deliberately only two:
 *
 *  1. Work out what an arbitrary query is actually asking for. Typing "milk"
 *     should not produce a dead end; it should be read as an intent to find
 *     dairy suppliers, and turned into searches a extraction engine can run.
 *  2. Pull structured contacts out of page text that the pattern matchers made
 *     a mess of, which is common on pages that render contacts as images,
 *     inside scripts, or in prose.
 *
 * The rule that makes this safe: the model is never asked for a fact. It is
 * only ever given text that was actually fetched, and asked to label what is
 * already in that text. Every value it returns is checked back against the
 * source text before it is accepted, so a hallucinated phone number is dropped
 * rather than published. When no key is configured everything below no-ops and
 * the engine runs exactly as it did before.
 */

export type AssistantProvider = 'gemini' | 'grok';

interface ProviderConfig {
  provider: AssistantProvider;
  apiKey: string;
  model: string;
  endpoint: string;
}

function providerConfig(): ProviderConfig | null {
  const gemini = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim();
  if (gemini) {
    const model = process.env.EXTRACTOR_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
    return {
      provider: 'gemini',
      apiKey: gemini,
      model,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    };
  }

  const grok = process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim();
  if (grok) {
    return {
      provider: 'grok',
      apiKey: grok,
      model: process.env.EXTRACTOR_GROK_MODEL?.trim() || 'grok-2-latest',
      endpoint: 'https://api.x.ai/v1/chat/completions',
    };
  }

  return null;
}

export function assistantAvailable(): boolean {
  return providerConfig() !== null;
}

export function assistantDescription(): string {
  const config = providerConfig();
  if (!config) {
    return 'No assistant key is configured. Set GEMINI_API_KEY (Google AI Studio) or XAI_API_KEY (Grok) to switch it on; both have free tiers.';
  }
  return `${config.provider === 'gemini' ? 'Google Gemini' : 'Grok'} (${config.model}) is configured.`;
}

const usage: AssistantUsage = { provider: 'none', tasks: [], callCount: 0, totalMs: 0 };

export function beginUsage(): AssistantUsage {
  const config = providerConfig();
  return {
    provider: config?.provider ?? 'none',
    model: config?.model,
    tasks: [],
    callCount: 0,
    totalMs: 0,
    unavailableReason: config ? undefined : assistantDescription(),
  };
}

interface CallOptions {
  system: string;
  user: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

async function call(options: CallOptions): Promise<string | null> {
  const config = providerConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  timer.unref?.();

  try {
    if (config.provider === 'gemini') {
      const response = await fetch(`${config.endpoint}?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: options.system }] },
          contents: [{ role: 'user', parts: [{ text: options.user }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: options.maxOutputTokens ?? 1024,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return body.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: options.maxOutputTokens ?? 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

/* --------------------------- Query interpretation -------------------------- */

export interface QueryInterpretation {
  /** What the operator is actually trying to find. */
  intent: string;
  /** Whether the input names one specific entity or describes a category. */
  shape: 'specific_entity' | 'category' | 'ambiguous';
  /** A business name to look up, when the input names one. */
  companyName?: string;
  personName?: string;
  location?: string;
  industry?: string;
  /** Concrete search strings to run, best first. */
  searchQueries: string[];
  reasoning: string;
}

const INTERPRETATION_SYSTEM = `You interpret search input for a business contact extraction tool used by sales teams.

The operator may type anything: a company name, a person, a domain, a phone number, or a bare word like "milk" or "roofers near Tampa".

Your job is to work out what they are trying to find and turn it into concrete web searches that would surface real businesses with contact details.

Rules:
- Never invent a specific company, phone number, address or website. You are interpreting the request, not answering it.
- For a bare category word like "milk", treat it as an intent to find businesses in that trade — dairy suppliers, distributors, processors — and say so.
- Only fill companyName or personName when the input actually names one.
- searchQueries must be plain search strings someone could paste into a search engine. Give between 2 and 4, best first.

Reply with JSON only, in this exact shape:
{"intent": string, "shape": "specific_entity" | "category" | "ambiguous", "companyName": string | null, "personName": string | null, "location": string | null, "industry": string | null, "searchQueries": string[], "reasoning": string}`;

export async function interpretQuery(query: string, usageOut: AssistantUsage): Promise<QueryInterpretation | null> {
  if (!assistantAvailable()) return null;
  const started = Date.now();
  const raw = await call({ system: INTERPRETATION_SYSTEM, user: query, maxOutputTokens: 600, timeoutMs: 8000 });
  usageOut.callCount += 1;
  usageOut.totalMs += Date.now() - started;
  if (!usageOut.tasks.includes('query_interpretation')) usageOut.tasks.push('query_interpretation');

  const parsed = parseJson<QueryInterpretation & { companyName: string | null; personName: string | null }>(raw);
  if (!parsed || !Array.isArray(parsed.searchQueries) || parsed.searchQueries.length === 0) return null;

  return {
    intent: String(parsed.intent ?? '').slice(0, 300),
    shape: parsed.shape === 'specific_entity' || parsed.shape === 'category' ? parsed.shape : 'ambiguous',
    companyName: parsed.companyName ?? undefined,
    personName: parsed.personName ?? undefined,
    location: parsed.location ?? undefined,
    industry: parsed.industry ?? undefined,
    searchQueries: parsed.searchQueries.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, 4),
    reasoning: String(parsed.reasoning ?? '').slice(0, 400),
  };
}

/* ---------------------------- Page extraction ----------------------------- */

export interface AssistantContacts {
  companyName?: string;
  phones: Array<{ number: string; label?: string }>;
  emails: string[];
  addresses: string[];
  people: Array<{ name: string; role?: string }>;
}

const EXTRACTION_SYSTEM = `You extract contact details from the text of a web page that has already been fetched.

Rules, in order of importance:
- Only return values that appear verbatim in the text you are given. Never complete, correct, normalise or infer a value. If a phone number is partly obscured, skip it.
- Never return a value you did not see in the text. An empty result is correct and expected when the page has no contact details.
- Skip anything that looks like a Social Security number, a date of birth, or any other government identifier. Do not return it in any field.
- For each phone number, include the word the page used next to it if there is one, such as "mobile", "cell", "office", "fax", "wireless" or "landline".

Reply with JSON only, in this exact shape:
{"companyName": string | null, "phones": [{"number": string, "label": string | null}], "emails": string[], "addresses": string[], "people": [{"name": string, "role": string | null}]}`;

/**
 * Asks the assistant to read contacts out of page text.
 *
 * Every returned value is checked back against the source text. A value the
 * model produced that is not actually in the page is dropped, which turns a
 * hallucination into a non-event rather than a fabricated contact.
 */
export async function extractContactsFromText(
  pageText: string,
  usageOut: AssistantUsage,
): Promise<AssistantContacts | null> {
  if (!assistantAvailable()) return null;
  const trimmed = pageText.replace(/\s+/g, ' ').trim().slice(0, 12000);
  if (trimmed.length < 40) return null;

  const started = Date.now();
  const raw = await call({ system: EXTRACTION_SYSTEM, user: trimmed, maxOutputTokens: 1200, timeoutMs: 12000 });
  usageOut.callCount += 1;
  usageOut.totalMs += Date.now() - started;
  if (!usageOut.tasks.includes('page_extraction')) usageOut.tasks.push('page_extraction');

  const parsed = parseJson<{
    companyName: string | null;
    phones: Array<{ number: string; label: string | null }>;
    emails: string[];
    addresses: string[];
    people: Array<{ name: string; role: string | null }>;
  }>(raw);
  if (!parsed) return null;

  // The grounding check. Digits are compared without punctuation because pages
  // and models format numbers differently; everything else must appear as-is.
  const haystack = trimmed.toLowerCase();
  const digitsOnly = trimmed.replace(/\D/g, '');
  const grounded = <T>(items: T[] | undefined, present: (item: T) => boolean): T[] =>
    (items ?? []).filter((item) => {
      try {
        return present(item);
      } catch {
        return false;
      }
    });

  return {
    companyName:
      parsed.companyName && haystack.includes(parsed.companyName.toLowerCase()) ? parsed.companyName : undefined,
    phones: grounded(parsed.phones, (phone) => {
      const digits = String(phone.number).replace(/\D/g, '');
      return digits.length >= 10 && digitsOnly.includes(digits);
    }).map((phone) => ({ number: String(phone.number), label: phone.label ?? undefined })),
    emails: grounded(parsed.emails, (email) => haystack.includes(String(email).toLowerCase())).map(String),
    addresses: grounded(parsed.addresses, (address) => haystack.includes(String(address).toLowerCase())).map(String),
    people: grounded(parsed.people, (person) => haystack.includes(String(person.name).toLowerCase())).map((person) => ({
      name: String(person.name),
      role: person.role ?? undefined,
    })),
  };
}

export { usage as assistantUsageTemplate };
