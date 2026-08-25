import { extractFields, summarizeText, type ExtractedField } from "./fields";

export type ExtractKind =
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "json"
  | "text"
  | "image"
  | "other";

export type ExtractTable = {
  name: string;
  rows: string[][];
};

export type ExtractResult = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: ExtractKind;
  text: string;
  pages?: number;
  sheets?: string[];
  tables: ExtractTable[];
  fields: ExtractedField[];
  words: number;
  lines: number;
  characters: number;
  error?: string;
};

const PDF_WORKER = "/pdf.worker.min.mjs";

function kindFromName(name: string, mime: string): ExtractKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
  if (/\.(xlsx|xls|xlsm)$/.test(lower) || mime.includes("spreadsheet")) return "xlsx";
  if (lower.endsWith(".csv") || mime.includes("csv")) return "csv";
  if (lower.endsWith(".json") || mime.includes("json")) return "json";
  if (/\.(txt|md|log|xml|html|htm|rtf)$/.test(lower) || mime.startsWith("text/")) {
    return "text";
  }
  if (/\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(lower) || mime.startsWith("image/")) {
    return "image";
  }
  return "other";
}

function finish(
  partial: Omit<ExtractResult, "fields" | "words" | "lines" | "characters">,
): ExtractResult {
  const stats = summarizeText(partial.text);
  return {
    ...partial,
    fields: extractFields(partial.text),
    ...stats,
  };
}

function decodeText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function extractPdf(buffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(line);
  }
  return {
    text: pages.filter(Boolean).join("\n\n"),
    pages: doc.numPages,
  };
}

async function extractDocx(buffer: ArrayBuffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

async function extractWorkbook(buffer: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const tables: ExtractTable[] = [];
  const texts: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const normalized = rows.map((row) => row.map((cell) => String(cell ?? "")));
    tables.push({ name, rows: normalized });
    const csv = XLSX.utils.sheet_to_csv(sheet);
    texts.push(`## ${name}\n${csv}`.trim());
  }
  return { text: texts.join("\n\n"), sheets: workbook.SheetNames, tables };
}

function extractCsv(text: string): ExtractTable {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (ch === "," && !quoted) {
          cells.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      cells.push(current);
      return cells;
    });
  return { name: "Sheet1", rows };
}

export async function extractFile(file: File): Promise<ExtractResult> {
  const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
  const kind = kindFromName(file.name, file.type || "");
  const base = {
    id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind,
    tables: [] as ExtractTable[],
  };

  try {
    const buffer = await file.arrayBuffer();

    if (kind === "pdf") {
      const pdf = await extractPdf(buffer);
      return finish({ ...base, text: pdf.text, pages: pdf.pages });
    }

    if (kind === "docx") {
      return finish({ ...base, text: await extractDocx(buffer) });
    }

    if (kind === "xlsx") {
      const book = await extractWorkbook(buffer);
      return finish({
        ...base,
        text: book.text,
        sheets: book.sheets,
        tables: book.tables,
      });
    }

    if (kind === "csv") {
      const text = decodeText(buffer);
      return finish({ ...base, text, tables: [extractCsv(text)] });
    }

    if (kind === "json") {
      const raw = decodeText(buffer);
      try {
        const pretty = JSON.stringify(JSON.parse(raw), null, 2);
        return finish({ ...base, text: pretty });
      } catch {
        return finish({ ...base, text: raw, error: "JSON is not valid; showing raw text." });
      }
    }

    if (kind === "image") {
      return finish({
        ...base,
        text: `Image file: ${file.name}\nType: ${file.type || "unknown"}\nSize: ${file.size} bytes\n\nImages are kept on this device. Text OCR is not run automatically.`,
      });
    }

    const text = decodeText(buffer);
    if (kind === "other" && /[\x00-\x08]/.test(text.slice(0, 200))) {
      return finish({
        ...base,
        text: "",
        error: "This file type is not a readable document. Try PDF, Word, Excel, CSV, JSON, or text.",
      });
    }
    return finish({ ...base, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not extract this file.";
    return finish({ ...base, text: "", error: message });
  }
}
