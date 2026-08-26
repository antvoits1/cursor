import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Database, History, Search, SlidersHorizontal } from 'lucide-react';
import { BulkWorkspace } from './components/BulkWorkspace';
import { DiagnosticsView } from './components/DiagnosticsView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { SingleExtraction } from './components/SingleExtraction';
import { StatusRail } from './components/StatusRail';
import * as api from './lib/api';
import {
  DEFAULT_SETTINGS,
  loadHistory,
  loadSettings,
  persistenceAvailable,
  saveHistory,
  saveSettings,
  toHistoryEntry,
  type HistoryEntry,
  type Settings,
} from './lib/storage';
import type { EngineDiagnostics, ExtractionResult } from './types';

export type TabId = 'extract' | 'bulk' | 'history' | 'diagnostics' | 'settings';

const TABS: Array<{ id: TabId; label: string; icon: typeof Search }> = [
  { id: 'extract', label: 'Extract', icon: Search },
  { id: 'bulk', label: 'Bulk', icon: Database },
  { id: 'history', label: 'History', icon: History },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('extract');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  const refreshDiagnostics = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await api.diagnostics(signal);
      setDiagnostics(next);
      setDiagnosticsError(null);
      return next;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return null;
      setDiagnostics(null);
      setDiagnosticsError((error as Error).message);
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshDiagnostics(controller.signal);
    // A slow poll keeps the status rail honest without hammering the API.
    const timer = window.setInterval(() => void refreshDiagnostics(), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshDiagnostics]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const recordResult = useCallback(
    (result: ExtractionResult) => {
      if (!settings.saveHistory) return;
      setHistory((current) => {
        const next = [toHistoryEntry(result), ...current.filter((entry) => entry.id !== result.id)];
        saveHistory(next);
        return next;
      });
    },
    [settings.saveHistory],
  );

  const replaceHistory = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    saveHistory(next);
  }, []);

  const rerunFromHistory = useCallback((query: string) => {
    setPendingQuery(query);
    setTab('extract');
  }, []);

  const resetSettings = useCallback(() => updateSettings({ ...DEFAULT_SETTINGS }), [updateSettings]);

  const statusTone = useMemo(() => {
    if (diagnosticsError) return 'bad' as const;
    if (!diagnostics) return 'neutral' as const;
    if (diagnostics.status === 'online') return 'good' as const;
    if (diagnostics.status === 'degraded') return 'warn' as const;
    return 'neutral' as const;
  }, [diagnostics, diagnosticsError]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 shadow-xs backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-white shadow-accent">
              <Search className="size-5" strokeWidth={2.4} />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-semibold text-ink">Extractor</h1>
              <p className="text-xs text-ink-faint">Layered public-record intelligence</p>
            </div>
          </div>

          <nav aria-label="Sections" className="order-3 w-full lg:order-2 lg:w-auto">
            <ul className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel-sunken p-1">
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setTab(id)}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-panel text-accent shadow-sm'
                          : 'text-ink-soft hover:bg-panel hover:text-ink'
                      }`}
                    >
                      <Icon className="size-4" strokeWidth={2.2} />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="order-2 lg:order-3">
            <StatusRail
              tone={statusTone}
              diagnostics={diagnostics}
              error={diagnosticsError}
              onRefresh={() => void refreshDiagnostics()}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-5 lg:px-8 lg:py-5 xl:h-[calc(100vh-65px)] xl:overflow-hidden">
        {tab === 'extract' && (
          <SingleExtraction
            settings={settings}
            pendingQuery={pendingQuery}
            onPendingQueryConsumed={() => setPendingQuery(null)}
            onResult={(result) => {
              recordResult(result);
              void refreshDiagnostics();
            }}
          />
        )}
        {tab === 'bulk' && <BulkWorkspace settings={settings} onResult={recordResult} />}
        {tab === 'history' && (
          <HistoryView
            entries={history}
            persistenceAvailable={persistenceAvailable}
            onReplace={replaceHistory}
            onRerun={rerunFromHistory}
          />
        )}
        {tab === 'diagnostics' && (
          <DiagnosticsView
            diagnostics={diagnostics}
            error={diagnosticsError}
            onRefresh={() => void refreshDiagnostics()}
          />
        )}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            onChange={updateSettings}
            onReset={resetSettings}
            diagnostics={diagnostics}
            onRefreshDiagnostics={() => void refreshDiagnostics()}
          />
        )}
      </main>

      <footer className="mx-auto max-w-[1600px] px-5 pb-6 pt-2 text-xs text-ink-faint lg:px-8 xl:hidden">
        {diagnostics ? `${diagnostics.build} v${diagnostics.version}` : 'Extractor'} · data comes from public
        sources only · nothing on this screen is generated or inferred beyond the evidence shown
      </footer>
    </div>
  );
}
