"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { extractFile, type ExtractResult } from "@/lib/extract";

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.csv,.json,.txt,.md,.log,.xml,.html,.rtf";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function resultToJson(result: ExtractResult) {
  return JSON.stringify(
    {
      fileName: result.fileName,
      kind: result.kind,
      pages: result.pages,
      sheets: result.sheets,
      fields: result.fields,
      tables: result.tables,
      text: result.text,
    },
    null,
    2,
  );
}

export function ExtractorApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ExtractResult[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => items.find((item) => item.id === activeId) ?? items[0] ?? null,
    [activeId, items],
  );

  const ingest = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => file.size > 0);
    if (!list.length) return;
    setBusy(true);
    const next: ExtractResult[] = [];
    for (const file of list) {
      next.push(await extractFile(file));
    }
    setItems((current) => [...next, ...current]);
    setActiveId(next[0]?.id ?? null);
    setBusy(false);
  }, []);

  function onDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void ingest(event.dataTransfer.files);
  }

  function exportText() {
    if (!active?.text) return;
    downloadBlob(active.fileName.replace(/\.[^.]+$/, "") + ".txt", active.text, "text/plain");
  }

  function exportJson() {
    if (!active) return;
    downloadBlob(active.fileName.replace(/\.[^.]+$/, "") + ".extracted.json", resultToJson(active), "application/json");
  }

  async function copyText() {
    if (!active?.text) return;
    await navigator.clipboard.writeText(active.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07090f]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/30" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M8 7h8M8 12h6M8 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">AA Extractor</p>
              <p className="text-xs text-zinc-400">One click. Front page. Files stay on this device.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/oneclick?format=zip"
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white"
            >
              Install on this PC
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8">
        <section
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-3xl border border-dashed p-8 transition ${
            dragging
              ? "border-cyan-300 bg-cyan-300/10"
              : "border-white/15 bg-[#10141f]"
          }`}
        >
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Drop a file. Get the data.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                PDF, Word, Excel, CSV, JSON, and text extract on the front page. Nothing is uploaded. Use Install on this PC once to put a Desktop shortcut here with no command window.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60"
              >
                {busy ? "Extracting…" : "Choose files"}
              </button>
              <p className="text-center text-xs text-zinc-500">or drag and drop</p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void ingest(event.target.files);
              event.target.value = "";
            }}
          />
        </section>

        {items.length === 0 ? (
          <section className="grid gap-4 md:grid-cols-3">
            {[
              ["No command window", "The PC shortcut opens this front page in an app window."],
              ["Works anywhere", "Same URL on Vercel, phone, or another computer."],
              ["Private by default", "Extraction runs in your browser. Files are not sent to a server."],
            ].map(([title, copy]) => (
              <article key={title} className="rounded-2xl border border-white/8 bg-[#10141f] p-5">
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p>
              </article>
            ))}
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="rounded-2xl border border-white/8 bg-[#10141f] p-3">
              <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Files</p>
              <ul className="flex flex-col gap-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left ${
                        active?.id === item.id ? "bg-cyan-300/15 text-white" : "text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      <span className="block truncate text-sm font-medium">{item.fileName}</span>
                      <span className="text-xs text-zinc-500">
                        {item.kind.toUpperCase()} · {formatBytes(item.size)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {active ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#10141f] px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{active.fileName}</h2>
                    <p className="text-xs text-zinc-500">
                      {active.words} words
                      {active.pages ? ` · ${active.pages} pages` : ""}
                      {active.sheets?.length ? ` · ${active.sheets.length} sheets` : ""}
                      {active.error ? ` · ${active.error}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copyText()} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white">
                      {copied ? "Copied" : "Copy text"}
                    </button>
                    <button type="button" onClick={exportText} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white">
                      Download .txt
                    </button>
                    <button type="button" onClick={exportJson} className="rounded-full bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-zinc-950">
                      Download JSON
                    </button>
                  </div>
                </div>

                {active.fields.length > 0 ? (
                  <div className="rounded-2xl border border-white/8 bg-[#10141f] p-5">
                    <h3 className="text-sm font-semibold text-white">Fields</h3>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      {active.fields.map((field) => (
                        <div key={field.key} className="rounded-xl bg-black/30 px-3 py-2">
                          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{field.key}</dt>
                          <dd className="mt-1 break-words text-sm text-zinc-100">{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                {active.tables.map((table) => (
                  <div key={table.name} className="overflow-hidden rounded-2xl border border-white/8 bg-[#10141f]">
                    <h3 className="px-5 py-3 text-sm font-semibold text-white">{table.name}</h3>
                    <div className="max-h-72 overflow-auto">
                      <table className="min-w-full text-left text-xs text-zinc-300">
                        <tbody>
                          {table.rows.slice(0, 80).map((row, index) => (
                            <tr key={`${table.name}-${index}`} className="border-t border-white/5">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="whitespace-nowrap px-4 py-2">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-[#10141f] p-5 text-sm leading-6 text-zinc-200">
                  {active.text || active.error || "No text found in this file."}
                </pre>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
