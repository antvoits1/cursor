import { useMemo, useState } from 'react';
import { Download, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { ResultPanel } from './ResultPanel';
import { Badge, Button, EmptyState, Panel, PanelHeader, Select, TextInput, type Tone } from './ui';
import { downloadCsv, SINGLE_HEADERS, singleResultRow, timestampSuffix } from '../lib/exporters';
import type { HistoryEntry } from '../lib/storage';
import type { ExtractionResult } from '../types';

/**
 * Completed runs kept in this browser.
 *
 * Each entry holds the whole result, so opening one shows the same structured
 * output and evidence the run produced — nothing is re-fetched or re-derived.
 */

const STATUS_TONE: Record<ExtractionResult['status'], Tone> = {
  success: 'good',
  partial: 'warn',
  failed: 'bad',
};

type StatusFilter = 'all' | ExtractionResult['status'];

export function HistoryView({
  entries,
  persistenceAvailable,
  onReplace,
  onRerun,
}: {
  entries: HistoryEntry[];
  persistenceAvailable: boolean;
  onReplace: (entries: HistoryEntry[]) => void;
  onRerun: (query: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries
      .filter((entry) => status === 'all' || entry.status === status)
      .filter((entry) => {
        if (!needle) return true;
        return (
          entry.query.toLowerCase().includes(needle) ||
          entry.companyName.toLowerCase().includes(needle) ||
          entry.website.toLowerCase().includes(needle)
        );
      });
    // Entries are stored newest first, so no additional sort is needed.
  }, [entries, search, status]);

  const open = entries.find((entry) => entry.id === openId) ?? null;

  const exportAll = () => {
    downloadCsv(
      `extractor-history-${timestampSuffix()}.csv`,
      SINGLE_HEADERS,
      filtered.map((entry) => singleResultRow(entry.result)),
    );
  };

  return (
    <div className="space-y-7">
      <Panel>
        <PanelHeader
          title="History"
          description={
            persistenceAvailable
              ? `${entries.length} runs saved in this browser. Nothing is sent anywhere.`
              : 'This browser blocks local storage, so history lasts only until the page is reloaded.'
          }
          actions={
            <>
              <Button size="sm" onClick={exportAll} disabled={filtered.length === 0}>
                <Download className="size-3.5" strokeWidth={2.4} />
                Export {filtered.length}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={entries.length === 0}
                onClick={() => {
                  onReplace([]);
                  setOpenId(null);
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={2.4} />
                Clear all
              </Button>
            </>
          }
        />
        <div className="flex flex-col gap-4 border-b border-line px-7 py-5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by query, company or website"
              aria-label="Search history"
              className="pl-10"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="sm:w-48"
          >
            <option value="all">All statuses</option>
            <option value="success">Complete</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={entries.length === 0 ? 'No runs yet' : 'Nothing matches those filters'}
            body={
              entries.length === 0
                ? 'Completed extractions are listed here with their full result and evidence.'
                : 'Clear the search box or choose a different status.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel-sunken">
                <tr className="text-xs tracking-wide text-ink-faint uppercase">
                  <th className="px-7 py-2.5 font-semibold">Query</th>
                  <th className="px-3 py-2.5 font-semibold">Found</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">When</th>
                  <th className="px-7 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-t border-line">
                    <td className="max-w-[22rem] px-7 py-3">
                      <button
                        type="button"
                        onClick={() => setOpenId(entry.id)}
                        className="block w-full truncate text-left font-medium text-accent hover:underline"
                      >
                        {entry.query}
                      </button>
                      {entry.companyName && (
                        <span className="block truncate text-xs text-ink-faint">{entry.companyName}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-soft">
                      {entry.phoneCount} phone · {entry.emailCount} email · {entry.addressCount} address
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={STATUS_TONE[entry.status]}>
                        {entry.status} · {entry.confidence}%
                      </Badge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-faint">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-7 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => onRerun(entry.query)}>
                          <RotateCcw className="size-3.5" strokeWidth={2.4} />
                          Rerun
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete the run for ${entry.query}`}
                          onClick={() => {
                            onReplace(entries.filter((candidate) => candidate.id !== entry.id));
                            if (openId === entry.id) setOpenId(null);
                          }}
                        >
                          <X className="size-3.5" strokeWidth={2.4} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Saved result for ${open.query}`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 sm:p-8"
          onClick={() => setOpenId(null)}
        >
          <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <Panel>
              <PanelHeader
                title={open.query}
                description={`Run on ${new Date(open.createdAt).toLocaleString()}`}
                actions={
                  <>
                    <Button size="sm" onClick={() => onRerun(open.query)}>
                      <RotateCcw className="size-3.5" strokeWidth={2.4} />
                      Rerun
                    </Button>
                    <Button size="sm" onClick={() => setOpenId(null)}>
                      Close
                    </Button>
                  </>
                }
              />
              <ResultPanel result={open.result} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
