"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dossier } from "@/lib/dossier";

type TimelineEvent = {
  type: string;
  message: string;
  timestamp?: string;
};

type Contact = {
  number?: string;
  email?: string;
  address?: string;
  line_type?: string;
  carrier?: string;
  smtp_status?: string;
  sources?: { label?: string; url?: string }[];
};

type Person = {
  name?: string;
  role?: string;
  roles?: string[];
  direct_phones?: Contact[];
  direct_emails?: Contact[];
  associated_addresses?: Contact[];
  evidence_sources?: { label?: string; url?: string }[];
};

type Source = { label?: string; url?: string; domain?: string };

const EXAMPLES = [
  { q: "Tesla", hint: "Company, officers, contact lines" },
  { q: "OpenAI", hint: "Leadership and public inboxes" },
  { q: "Stripe", hint: "Domain, people, press trail" },
  { q: "Shopify", hint: "HQ, founders, support mail" },
];

function initials(name?: string) {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

function downloadJson(dossier: Dossier) {
  const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(dossier.entity.name || "dossier").replace(/[^\w.-]+/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function eventTone(type: string) {
  if (type.includes("COMPLETE") || type.includes("SOURCE_COMPLETED") || type.includes("CACHE")) {
    return "bg-[#9db89a]";
  }
  if (type.includes("FAIL") || type.includes("ERROR") || type.includes("BLOCK")) {
    return "bg-[#d4a0a0]";
  }
  return "bg-[#e0c48a]";
}

export function ExtractorApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<EventSource | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready for a name, domain, email, or phone.");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [selectedPerson, setSelectedPerson] = useState(-1);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      if (initial) startSearch(initial);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      streamRef.current?.close();
    };
  }, []);

  const people = (dossier?.people || []) as Person[];
  const person = selectedPerson >= 0 ? people[selectedPerson] : null;
  const entity = dossier?.entity;
  const stage = busy && !dossier ? "research" : dossier ? "dossier" : "home";

  const stats = useMemo(() => {
    if (!dossier) return [];
    return [
      ["People", people.length],
      ["Phones", entity?.phones.length || 0],
      ["Emails", entity?.emails.length || 0],
      ["Sources", dossier.sources.length],
    ] as const;
  }, [dossier, people.length, entity]);

  function markCopied(value: string) {
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function startSearch(raw: string) {
    const nextQuery = raw.trim();
    if (!nextQuery) return;
    setQuery(nextQuery);
    streamRef.current?.close();
    setBusy(true);
    setError("");
    setStatus(`Opening public pages for ${nextQuery}`);
    setTimeline([]);
    setDossier(null);
    setSelectedPerson(-1);
    const url = new URL(window.location.href);
    url.searchParams.set("q", nextQuery);
    window.history.replaceState(null, "", url);

    const source = new EventSource(`/api/v1/research/stream?query=${encodeURIComponent(nextQuery)}`);
    streamRef.current = source;
    let finished = false;

    source.onmessage = (event) => {
      let payload: TimelineEvent & { data?: Dossier };
      try {
        payload = JSON.parse(event.data) as TimelineEvent & { data?: Dossier };
      } catch {
        return;
      }
      setTimeline((current) => [...current.slice(-48), payload]);
      setStatus(payload.message || "Working…");
      if (payload.type === "COMPLETE" || payload.type === "CACHE_HIT") {
        finished = true;
        setDossier(payload.data || null);
        setBusy(false);
        setStatus("Dossier ready");
        source.close();
      }
      if (payload.type === "ERROR" || payload.type === "SSRF_BLOCKED") {
        finished = true;
        setBusy(false);
        setError(payload.message || "Research failed");
        setStatus("Stopped");
        source.close();
      }
    };
    source.onerror = () => {
      if (finished) return;
      finished = true;
      setBusy(false);
      setError("The research stream closed before completion.");
      setStatus("Connection closed");
      source.close();
    };
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startSearch(query);
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(224,196,138,0.16),transparent_42%),radial-gradient(ellipse_at_85%_20%,rgba(122,142,168,0.12),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[88px_88px]" />
        <div className="iq-grain" />
      </div>

      <header className="relative z-10 border-b border-[var(--line)] bg-[#070605]/72 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[1.15rem] bg-[#e0c48a] text-[11px] font-semibold tracking-[0.22em] text-[#1c140c] shadow-[0_0_32px_rgba(224,196,138,0.28)]">
              IQ
            </span>
            <div>
              <p className="text-[15px] font-medium tracking-tight text-[#f4efe6]">Intelligence Extractor</p>
              <p className="text-[11px] tracking-[0.16em] uppercase text-[#8a8378]">Public web dossier</p>
            </div>
          </div>
          <a
            href="/api/oneclick?format=zip"
            className="rounded-full border border-[#e0c48a]/28 bg-[#e0c48a]/10 px-4 py-2 text-sm text-[#ead7b0] transition hover:bg-[#e0c48a] hover:text-[#1c140c]"
          >
            Install on this PC
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 md:py-12">
        {stage === "home" ? (
          <Landing
            inputRef={inputRef}
            query={query}
            setQuery={setQuery}
            busy={busy}
            error={error}
            onSubmit={onSubmit}
            onExample={(value) => {
              setQuery(value);
              startSearch(value);
            }}
          />
        ) : null}

        {stage === "research" ? (
          <Researching
            query={query}
            status={status}
            error={error}
            timeline={timeline}
            inputRef={inputRef}
            setQuery={setQuery}
            busy={busy}
            onSubmit={onSubmit}
          />
        ) : null}

        {stage === "dossier" && dossier ? (
          <section className="iq-rise flex flex-col gap-6">
            <SearchForm
              inputRef={inputRef}
              query={query}
              setQuery={setQuery}
              busy={busy}
              onSubmit={onSubmit}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm ${error ? "text-[#d4a0a0]" : "text-[#8a8378]"}`}>{error || status}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDossier(null);
                    setTimeline([]);
                    setError("");
                    setStatus("Ready for a name, domain, email, or phone.");
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#cfc6b8] hover:border-[#e0c48a]/40"
                >
                  New search
                </button>
                <button
                  type="button"
                  onClick={() => downloadJson(dossier)}
                  className="rounded-full border border-[#e0c48a]/30 bg-[#e0c48a]/10 px-3 py-1.5 text-xs text-[#ead7b0]"
                >
                  Download JSON
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <PersonChip
                active={selectedPerson === -1}
                name={entity?.name || "Company"}
                role={entity?.official_domain || "Profile"}
                onClick={() => setSelectedPerson(-1)}
              />
              {people.map((item, index) => (
                <PersonChip
                  key={`${item.name}-${index}`}
                  active={selectedPerson === index}
                  name={item.name || "Unnamed"}
                  role={item.role || (item.roles || []).join(", ") || "Contact"}
                  onClick={() => setSelectedPerson(index)}
                />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex flex-col gap-4">
                <article className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[#11100e]/88 p-6 backdrop-blur-xl md:p-8">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[#e0c48a]">
                    {person ? "Person intelligence" : "Company intelligence"}
                  </p>
                  <h2 className="font-display mt-3 text-4xl leading-[1.05] text-[#f6f1e6] md:text-5xl">
                    {person?.name || entity?.name || query}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9a9287]">
                    {person?.role || entity?.official_website || entity?.official_domain || "Public web dossier"}
                  </p>
                  <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {stats.map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/8 bg-black/25 px-4 py-4">
                        <p className="font-display text-2xl text-[#f6f1e6]">{value}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8a8378]">{label}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <div className="grid gap-4 md:grid-cols-2">
                  <RecordCard
                    title={person ? "Direct phones" : "Company phones"}
                    items={person?.direct_phones || (entity?.phones as Contact[]) || []}
                    getValue={(item) => item.number || ""}
                    getMeta={(item) => [item.line_type, item.carrier].filter(Boolean).join(" · ")}
                    copied={copied}
                    onCopy={(value) => {
                      void copyText(value);
                      markCopied(value);
                    }}
                  />
                  <RecordCard
                    title={person ? "Direct emails" : "Company emails"}
                    items={person?.direct_emails || (entity?.emails as Contact[]) || []}
                    getValue={(item) => item.email || ""}
                    getMeta={(item) => item.smtp_status || ""}
                    copied={copied}
                    onCopy={(value) => {
                      void copyText(value);
                      markCopied(value);
                    }}
                  />
                  <RecordCard
                    title={person ? "Addresses" : "Locations"}
                    items={person?.associated_addresses || (entity?.addresses as Contact[]) || []}
                    getValue={(item) => item.address || ""}
                    getMeta={() => "Public record"}
                    copied={copied}
                    onCopy={(value) => {
                      void copyText(value);
                      markCopied(value);
                    }}
                    wide
                  />
                  <RecordCard
                    title="Sources"
                    items={dossier.sources as Source[]}
                    getValue={(item) => String(item.label || item.url || "")}
                    getMeta={(item) => String(item.domain || item.url || "")}
                    getHref={(item) => item.url || ""}
                    copied={copied}
                    onCopy={(value) => {
                      void copyText(value);
                      markCopied(value);
                    }}
                    wide
                  />
                </div>
              </div>

              <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[#11100e]/88 p-5 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#8a8378]">Live route</p>
                <ol className="mt-5 space-y-4">
                  {timeline.slice(-16).reverse().map((item, index) => (
                    <li key={`${item.timestamp}-${index}`} className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTone(item.type)}`} />
                      <div>
                        <p className="text-sm leading-5 text-[#e7e1d6]">{item.message}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#6f6a62]">{item.type}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Landing({
  inputRef,
  query,
  setQuery,
  busy,
  error,
  onSubmit,
  onExample,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (value: string) => void;
  busy: boolean;
  error: string;
  onSubmit: (event: React.FormEvent) => void;
  onExample: (value: string) => void;
}) {
  return (
    <section className="iq-rise mx-auto max-w-3xl pt-8 text-center md:pt-16">
      <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-[#e0c48a]">Front page · live web scrape</p>
      <h1 className="font-display mt-6 text-[2.7rem] leading-[0.98] text-[#f6f1e6] md:text-[4.6rem]">
        Enter anything.
        <span className="mt-2 block italic text-[#e0c48a]">Extract the people behind it.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[#a39b90]">
        Company, owner, email, phone, domain, or URL. The extractor searches public pages and lays phones, inboxes, roles, and sources onto this screen.
      </p>
      <SearchForm
        inputRef={inputRef}
        query={query}
        setQuery={setQuery}
        busy={busy}
        onSubmit={onSubmit}
        large
      />
      {error ? <p className="mt-4 text-sm text-[#d4a0a0]">{error}</p> : null}
      <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {EXAMPLES.map((example) => (
          <button
            key={example.q}
            type="button"
            onClick={() => onExample(example.q)}
            className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:border-[#e0c48a]/35 hover:bg-[#e0c48a]/8"
          >
            <span className="block text-sm text-[#f4efe6]">{example.q}</span>
            <span className="mt-1 block text-[11px] leading-4 text-[#8a8378]">{example.hint}</span>
          </button>
        ))}
      </div>
      <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-6 text-left">
        {[
          ["01", "Search", "DuckDuckGo, Bing, Wikipedia"],
          ["02", "Scrape", "Open the pages. Lift the facts."],
          ["03", "Dossier", "People, phones, mail, sources."],
        ].map(([n, title, copy]) => (
          <div key={n}>
            <p className="text-[11px] tracking-[0.2em] text-[#e0c48a]">{n}</p>
            <p className="mt-2 text-sm text-[#f4efe6]">{title}</p>
            <p className="mt-1 text-xs leading-5 text-[#8a8378]">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Researching({
  query,
  status,
  error,
  timeline,
  inputRef,
  setQuery,
  busy,
  onSubmit,
}: {
  query: string;
  status: string;
  error: string;
  timeline: TimelineEvent[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  setQuery: (value: string) => void;
  busy: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <section className="iq-rise flex flex-col gap-8">
      <SearchForm
        inputRef={inputRef}
        query={query}
        setQuery={setQuery}
        busy={busy}
        onSubmit={onSubmit}
      />
      <div className="relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[#11100e]/90 px-6 py-16 text-center backdrop-blur-xl md:px-12">
        <div className="iq-scan" />
        <div className="relative mx-auto mb-8 grid h-24 w-24 place-items-center">
          <span className="absolute inset-0 rounded-full border border-[#e0c48a]/25 animate-[pulse-ring_2.1s_ease-out_infinite]" />
          <span className="absolute inset-2 rounded-full border border-[#e0c48a]/20 animate-[pulse-ring_2.1s_ease-out_infinite] [animation-delay:.4s]" />
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e0c48a] text-xs font-semibold tracking-[0.2em] text-[#1c140c]">
            IQ
          </span>
        </div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#e0c48a]">Scraping the public web</p>
        <h2 className="font-display mt-4 text-4xl italic text-[#f6f1e6] md:text-5xl">{query}</h2>
        <p className={`mx-auto mt-4 max-w-lg text-sm ${error ? "text-[#d4a0a0]" : "text-[#9a9287]"}`}>
          {error || status}
        </p>
      </div>
      <ol className="mx-auto w-full max-w-2xl space-y-3">
        {timeline.slice(-10).map((item, index) => (
          <li
            key={`${item.timestamp}-${index}`}
            className="flex items-start gap-3 rounded-2xl border border-white/6 bg-black/20 px-4 py-3"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTone(item.type)}`} />
            <div>
              <p className="text-sm text-[#e7e1d6]">{item.message}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#6f6a62]">{item.type}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PersonChip({
  name,
  role,
  active,
  onClick,
}: {
  name: string;
  role: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[168px] items-center gap-3 rounded-full border px-3 py-2 text-left transition ${
        active
          ? "border-[#e0c48a]/45 bg-[#e0c48a]/12"
          : "border-white/8 bg-black/20 hover:border-[#e0c48a]/25"
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e0c48a]/18 text-[11px] tracking-wide text-[#ead7b0]">
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-[#f4efe6]">{name}</span>
        <span className="block truncate text-[11px] text-[#8a8378]">{role}</span>
      </span>
    </button>
  );
}

function SearchForm({
  inputRef,
  query,
  setQuery,
  busy,
  onSubmit,
  large = false,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (value: string) => void;
  busy: boolean;
  onSubmit: (event: React.FormEvent) => void;
  large?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={large ? "mx-auto mt-10 w-full max-w-2xl" : "w-full"}>
      <label className="sr-only" htmlFor="intel-search">
        Search the web
      </label>
      <div
        className={`flex items-center gap-2 rounded-full border border-[#e0c48a]/28 bg-[#11100e]/92 p-1.5 shadow-[0_0_90px_rgba(224,196,138,0.12)] ${
          large ? "h-[4.25rem]" : "h-14"
        }`}
      >
        <input
          id="intel-search"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Company, owner, email, phone, domain or URL"
          className="h-full min-w-0 flex-1 bg-transparent px-5 text-[15px] text-[#f6f1e6] outline-none placeholder:text-[#6f6a62]"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="h-full rounded-full bg-[#e0c48a] px-6 text-sm font-semibold text-[#1c140c] transition enabled:hover:bg-[#ead7b0] disabled:opacity-45"
        >
          {busy ? "Scraping" : "Research"}
        </button>
      </div>
    </form>
  );
}

function RecordCard<T>({
  title,
  items,
  getValue,
  getMeta,
  getHref,
  copied,
  onCopy,
  wide = false,
}: {
  title: string;
  items: T[];
  getValue: (item: T) => string;
  getMeta: (item: T) => string;
  getHref?: (item: T) => string;
  copied: string;
  onCopy: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <section className={`rounded-[1.75rem] border border-[var(--line)] bg-[#11100e]/80 p-5 ${wide ? "md:col-span-2" : ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm tracking-wide text-[#f4efe6]">{title}</h3>
        <span className="text-xs text-[#8a8378]">{items.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.length ? (
          items.slice(0, 8).map((item, index) => {
            const value = getValue(item);
            const meta = getMeta(item);
            const href = getHref?.(item);
            return (
              <div key={`${value}-${index}`} className="flex items-start justify-between gap-3 rounded-2xl bg-black/28 px-3 py-3">
                <div className="min-w-0">
                  {href && /^https?:/.test(href) ? (
                    <a href={href} target="_blank" rel="noreferrer" className="block truncate text-sm text-[#f6f1e6] hover:text-[#e0c48a]">
                      {value}
                    </a>
                  ) : (
                    <p className="break-words text-sm text-[#f6f1e6]">{value || "—"}</p>
                  )}
                  {meta && meta !== value ? <p className="mt-1 truncate text-xs text-[#8a8378]">{meta}</p> : null}
                </div>
                {value ? (
                  <button
                    type="button"
                    onClick={() => onCopy(href && /^https?:/.test(href) ? href : value)}
                    className="shrink-0 text-xs text-[#e0c48a]"
                  >
                    {copied === value || copied === href ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="py-7 text-center text-sm text-[#6f6a62]">Nothing confirmed yet.</p>
        )}
      </div>
    </section>
  );
}
