import { useEffect, useState } from 'react';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState, Field, Panel, PanelHeader, TextInput, Toggle } from './ui';
import * as api from '../lib/api';
import type { CustomSource } from '../types';

/**
 * The list of extra places this installation looks.
 *
 * It lives on the server rather than in this browser, which is the whole point
 * of it: adding a county register here means every run on this server checks
 * it, and clearing browser data does not quietly throw the list away.
 */
export function SavedSources() {
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [placeholders, setPlaceholders] = useState<Array<{ token: string; describes: string }>>([]);
  const [persistent, setPersistent] = useState(true);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listSources(controller.signal)
      .then((response) => {
        setSources(response.sources);
        setPlaceholders(response.placeholders);
        setPersistent(response.persistent);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => controller.abort();
  }, []);

  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await api.addSource(url, label || undefined);
      setSources(response.sources);
      setUrl('');
      setLabel('');
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (source: CustomSource) => {
    try {
      setSources((await api.setSourceEnabled(source.id, !source.enabled)).sources);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const remove = async (source: CustomSource) => {
    try {
      setSources((await api.removeSource(source.id)).sources);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Places to look"
        description="Web addresses this server checks on every run, on top of the built-in ones. Saved here, not in your browser, so they apply to everyone using this server."
      />

      <div className="space-y-5 px-7 py-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end">
          <Field
            label="Web address"
            htmlFor="source-url"
            help="Paste the address of a search page. Put a placeholder where the lead's details should go — see the list below."
          >
            <TextInput
              id="source-url"
              value={url}
              placeholder="https://example.com/search?q={name}&city={city}"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && url.trim() && !busy) void add();
              }}
            />
          </Field>
          <Field label="Call it" htmlFor="source-label" help="Optional. Shown in the route.">
            <TextInput
              id="source-label"
              value={label}
              placeholder="NY corporation register"
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Button variant="primary" onClick={() => void add()} disabled={!url.trim() || busy}>
            <Plus className="size-3.5" strokeWidth={2.6} />
            Save it
          </Button>
        </div>

        {problem ? (
          <p className="rounded-[var(--radius-control)] border border-bad-border bg-bad-soft px-4 py-3 text-sm text-bad">
            {problem}
          </p>
        ) : null}

        {!persistent ? (
          <p className="rounded-[var(--radius-control)] border border-warn-border bg-warn-soft px-4 py-3 text-sm text-warn">
            This server has no disk it can write to, so anything saved here is forgotten when it restarts.
          </p>
        ) : null}

        <div className="rounded-[var(--radius-control)] border border-line bg-panel-sunken px-4 py-3">
          <p className="text-2xs font-bold uppercase tracking-[0.1em] text-ink-faint">
            Write any of these in the address and the run fills them in
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {placeholders.map((placeholder) => (
              <li key={placeholder.token} className="text-sm text-ink-soft">
                <code className="font-mono text-accent-strong">{placeholder.token}</code>
                <span className="text-ink-faint"> — {placeholder.describes}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            A saved address is skipped, and the route says so, whenever a search does not have the detail one of its
            placeholders needs.
          </p>
        </div>

        {loaded && sources.length === 0 ? (
          <EmptyState
            icon={<Globe className="size-5" strokeWidth={1.8} />}
            title="No extra places yet"
            body="The built-in sources are still used on every run. Add an address above to check somewhere else as well."
          />
        ) : null}

        {sources.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-control)] border border-line">
            {sources.map((source) => (
              <li key={source.id} className="flex items-start gap-4 bg-panel-raised px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{source.label}</span>
                    {source.enabled ? <Badge tone="good">on</Badge> : <Badge tone="neutral">off</Badge>}
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-ink-faint">{source.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Toggle checked={source.enabled} onChange={() => void toggle(source)} label="" />
                  <Button size="sm" variant="danger" onClick={() => void remove(source)}>
                    <Trash2 className="size-3.5" strokeWidth={2.4} />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}
