export type ExtractedField = {
  key: string;
  value: string;
};

const FIELD_LINE =
  /^\s*([A-Za-z][A-Za-z0-9 ./%()#_-]{1,60})\s*[:#=\-]\s+(.+?)\s*$/;

export function extractFields(text: string, limit = 80): ExtractedField[] {
  const seen = new Set<string>();
  const fields: ExtractedField[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > 240) continue;
    const match = line.match(FIELD_LINE);
    if (!match) continue;

    const key = match[1].replace(/\s+/g, " ").trim();
    const value = match[2].trim();
    if (key.length < 2 || value.length < 1) continue;
    if (/^https?:\/\//i.test(key)) continue;

    const id = key.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    fields.push({ key, value });
    if (fields.length >= limit) break;
  }

  return fields;
}

export function summarizeText(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const words = trimmed ? trimmed.split(" ").length : 0;
  const lines = text ? text.split(/\r?\n/).length : 0;
  return { words, lines, characters: text.length };
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

function unique(values: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

export function extractContacts(text: string) {
  return {
    emails: unique(text.match(EMAIL_RE) ?? [], 20),
    phones: unique((text.match(PHONE_RE) ?? []).filter((n) => n.replace(/\D/g, "").length >= 10), 20),
  };
}

export function extractLabeledAndContacts(text: string): ExtractedField[] {
  const fields = extractFields(text, 40);
  const { emails, phones } = extractContacts(text);
  const extra: ExtractedField[] = [
    ...emails.map((value) => ({ key: "Email", value })),
    ...phones.map((value) => ({ key: "Phone", value })),
  ];
  return [...fields, ...extra].slice(0, 80);
}
