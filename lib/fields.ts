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
