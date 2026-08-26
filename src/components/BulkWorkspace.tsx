import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { ResultPanel } from './ResultPanel';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelHeader,
  ProgressBar,
  Select,
  Spinner,
  StatTile,
  type Tone,
} from './ui';
import * as api from '../lib/api';
import { exportBulkJob } from '../lib/exporters';
import { SUPPORTED_EXTENSIONS, parseWorkbook, remapRows } from '../lib/spreadsheet';
import type { Settings } from '../lib/storage';
import type { BulkJob, BulkRow, BulkRowStatus, ColumnRole, ExtractionResult } from '../types';

/**
 * Bulk enrichment workspace.
 *
 * The sheet is parsed in this browser, never uploaded. That is deliberate:
 * a lead sheet can contain protected identifiers, and the surest way to keep
 * them out of the pipeline is for them never to leave the machine. Only the
 * assembled query and the non-sensitive columns of a row are sent, one row at
 * a time.
 */

const ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> = [
  { value: 'preserved', label: 'Keep as-is' },
  { value: 'company', label: 'Company name' },
  { value: 'owner', label: 'Owner / contact' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Website' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'zip', label: 'ZIP' },
];

const STATUS_TONE: Record<BulkRowStatus, Tone> = {
  pending: 'neutral',
  processing: 'accent',
  success: 'good',
  partial: 'warn',
  failed: 'bad',
  skipped: 'neutral',
};

type RowFilter = 'all' | BulkRowStatus;

const FILTERS: Array<{ id: RowFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'success', label: 'Complete' },
  { id: 'partial', label: 'Partial' },
  { id: 'failed', label: 'Failed' },
  { id: 'skipped', label: 'Skipped' },
];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function tally(rows: BulkRow[]) {
  const counts = { succeeded: 0, partial: 0, failed: 0, skipped: 0, pending: 0, processing: 0 };
  for (const row of rows) {
    if (row.status === 'success') counts.succeeded += 1;
    else if (row.status === 'partial') counts.partial += 1;
    else if (row.status === 'failed') counts.failed += 1;
    else if (row.status === 'skipped') counts.skipped += 1;
    else if (row.status === 'pending') counts.pending += 1;
    else counts.processing += 1;
  }
  return counts;
}

export function BulkWorkspace({
  settings,
  onResult,
}: {
  settings: Settings;
  onResult: (result: ExtractionResult) => void;
}) {
  const [job, setJob] = useState<BulkJob | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // One driver loop at a time. Resume flips a flag; it never starts a second loop.
  const driverActiveRef = useRef(false);
  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const controllersRef = useRef(new Map<string, AbortController>());
  const jobRef = useRef<BulkJob | null>(null);

  const commit = useCallback((updater: (current: BulkJob) => BulkJob) => {
    setJob((current) => {
      if (!current) return current;
      const next = updater(current);
      jobRef.current = next;
      return next;
    });
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setParseError(null);
    setOpenRow(null);
    setFilter('all');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbook(buffer, { filename: file.name });
      const counts = tally(parsed.rows);
      const next: BulkJob = {
        id: `bulk_${Date.now().toString(36)}`,
        name: file.name,
        file: parsed.file,
        rows: parsed.rows,
        status: 'idle',
        processed: 0,
        succeeded: 0,
        partial: 0,
        failed: 0,
        skipped: counts.skipped,
        deepScan: settings.deepScan,
      };
      jobRef.current = next;
      setJob(next);
    } catch (error) {
      setJob(null);
      jobRef.current = null;
      setParseError((error as Error).message);
    }
  }, [settings.deepScan]);

  const processRow = useCallback(
    async (rowId: string) => {
      const current = jobRef.current;
      const row = current?.rows.find((candidate) => candidate.rowId === rowId);
      if (!current || !row) return;

      commit((state) => ({
        ...state,
        rows: state.rows.map((item) => (item.rowId === rowId ? { ...item, status: 'processing', error: undefined } : item)),
      }));

      const controller = new AbortController();
      controllersRef.current.set(rowId, controller);
      const startedAt = Date.now();

      try {
        const result = await api.extract({
          query: row.query,
          deepScan: settings.deepScan,
          budgetMs: settings.runBudgetMs,
          rowId,
          preservedFields: row.original,
          signal: controller.signal,
        });
        commit((state) => ({
          ...state,
          rows: state.rows.map((item) =>
            item.rowId === rowId
              ? {
                  ...item,
                  status: result.status === 'failed' ? 'failed' : result.status,
                  result,
                  error: result.status === 'failed' ? result.failureReason : undefined,
                  durationMs: result.durationMs,
                }
              : item,
          ),
        }));
        onResult(result);
      } catch (error) {
        const aborted = (error as Error).name === 'AbortError';
        commit((state) => ({
          ...state,
          rows: state.rows.map((item) =>
            item.rowId === rowId
              ? {
                  ...item,
                  status: aborted ? 'pending' : 'failed',
                  error: aborted ? undefined : (error as Error).message,
                  durationMs: Date.now() - startedAt,
                }
              : item,
          ),
        }));
      } finally {
        controllersRef.current.delete(rowId);
      }
    },
    [commit, onResult, settings.deepScan, settings.runBudgetMs],
  );

  const drive = useCallback(async () => {
    if (driverActiveRef.current) return;
    driverActiveRef.current = true;
    stoppedRef.current = false;
    pausedRef.current = false;

    commit((state) => ({
      ...state,
      status: 'running',
      startedAt: state.startedAt ?? new Date().toISOString(),
      endedAt: undefined,
    }));

    const queue = (jobRef.current?.rows ?? []).filter((row) => row.status === 'pending').map((row) => row.rowId);
    let cursor = 0;
    const takeNext = (): string | undefined => (cursor < queue.length ? queue[cursor++] : undefined);

    const worker = async (): Promise<void> => {
      for (;;) {
        while (pausedRef.current && !stoppedRef.current) await sleep(120);
        if (stoppedRef.current) return;
        const rowId = takeNext();
        if (!rowId) return;
        await processRow(rowId);
      }
    };

    const width = Math.max(1, Math.min(settings.bulkConcurrency, queue.length || 1));
    await Promise.all(Array.from({ length: width }, () => worker()));

    driverActiveRef.current = false;
    const stopped = stoppedRef.current;
    commit((state) => ({
      ...state,
      status: stopped ? 'stopped' : 'completed',
      endedAt: new Date().toISOString(),
    }));
    setTick((value) => value + 1);
  }, [commit, processRow, settings.bulkConcurrency]);

  const pause = useCallback(() => {
    if (!driverActiveRef.current) return;
    pausedRef.current = true;
    commit((state) => ({ ...state, status: 'paused' }));
  }, [commit]);

  const resume = useCallback(() => {
    if (!driverActiveRef.current) {
      void drive();
      return;
    }
    pausedRef.current = false;
    commit((state) => ({ ...state, status: 'running' }));
  }, [commit, drive]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    pausedRef.current = false;
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    commit((state) => ({ ...state, status: 'stopped' }));
  }, [commit]);

  /** Puts every row back to pending and runs the sheet from the top. */
  const restart = useCallback(() => {
    if (driverActiveRef.current) return;
    commit((state) => ({
      ...state,
      rows: state.rows.map((row) =>
        row.status === 'skipped'
          ? row
          : { ...row, status: 'pending', result: undefined, error: undefined, durationMs: undefined },
      ),
      status: 'idle',
      startedAt: undefined,
      endedAt: undefined,
    }));
    window.setTimeout(() => void drive(), 0);
  }, [commit, drive]);

  /** Re-queues only the rows that failed, leaving completed rows untouched. */
  const retryFailed = useCallback(() => {
    if (driverActiveRef.current) return;
    commit((state) => ({
      ...state,
      rows: state.rows.map((row) => (row.status === 'failed' ? { ...row, status: 'pending', error: undefined } : row)),
    }));
    window.setTimeout(() => void drive(), 0);
  }, [commit, drive]);

  const reset = useCallback(() => {
    stop();
    driverActiveRef.current = false;
    setJob(null);
    jobRef.current = null;
    setParseError(null);
    setOpenRow(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [stop]);

  const changeRole = useCallback(
    (header: string, role: ColumnRole) => {
      commit((state) => {
        const roles: Record<string, ColumnRole> = { ...state.file.detectedRoles, [header]: role };
        // A role that identifies the row can only be held by one column.
        if (role !== 'preserved') {
          for (const other of state.file.headers) {
            if (other !== header && roles[other] === role) roles[other] = 'preserved';
          }
        }
        return {
          ...state,
          file: { ...state.file, detectedRoles: roles },
          rows: remapRows(state.rows, state.file.headers, roles),
        };
      });
    },
    [commit],
  );

  const counts = useMemo(() => (job ? tally(job.rows) : null), [job]);
  const totalWork = job ? job.rows.length - (counts?.skipped ?? 0) : 0;
  const done = counts ? counts.succeeded + counts.partial + counts.failed : 0;
  const busy = job?.status === 'running' || job?.status === 'paused';
  const visibleRows = useMemo(
    () => (job ? job.rows.filter((row) => filter === 'all' || row.status === filter) : []),
    [job, filter],
  );
  const errorRows = useMemo(() => (job ? job.rows.filter((row) => row.status === 'failed') : []), [job]);
  const detailRow = job?.rows.find((row) => row.rowId === openRow) ?? null;

  return (
    <div className="space-y-7">
      <Panel>
        <PanelHeader
          step={1}
          title="Upload a lead sheet"
          description="Accepts .xlsx, .xls and .csv. The file is read in this browser and never uploaded."
          actions={job ? <Button size="sm" variant="ghost" onClick={reset}><Trash2 className="size-3.5" strokeWidth={2.2} />Clear</Button> : undefined}
        />
        <div className="px-7 py-6">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-8 py-12 text-center transition-colors ${
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel-raised'
            }`}
          >
            <Upload className="size-7 text-ink-faint" strokeWidth={1.8} />
            <p className="text-[15px] font-semibold text-ink">Drop a spreadsheet here</p>
            <p className="max-w-md text-sm text-ink-faint">
              Columns are detected automatically. Any column that holds a Social Security number is excluded
              before anything is read.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
            <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet className="size-4" strokeWidth={2.2} />
              Choose a file
            </Button>
          </div>
          {parseError && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-4 py-3 text-sm text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" strokeWidth={2.2} />
              {parseError}
            </p>
          )}
        </div>
      </Panel>

      {job && counts && (
        <>
          <Panel>
            <PanelHeader step={2} title="File" description={job.file.filename} />
            <div className="space-y-5 px-7 py-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Sheet" value={job.file.sheetName} />
                <StatTile label="Rows in sheet" value={job.file.totalSheetRows} />
                <StatTile label="Rows to process" value={job.file.usableRows} tone="accent" />
                <StatTile label="Rows skipped" value={job.file.skippedRows} />
              </div>
              {job.file.excludedColumns.length > 0 && (
                <p className="flex items-start gap-2.5 rounded-lg border border-good/25 bg-good-soft px-4 py-3 text-sm text-ink">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={2.2} />
                  <span>
                    <strong className="font-semibold">
                      {job.file.excludedColumns.length}{' '}
                      {job.file.excludedColumns.length === 1 ? 'column was' : 'columns were'} excluded:
                    </strong>{' '}
                    {job.file.excludedColumns.join(', ')}. These values are dropped at parse time and never reach
                    search, matching, evidence, scoring, learning, diagnostics or export.
                    {job.file.excludedByContent.length > 0 && (
                      <>
                        {' '}
                        {job.file.excludedByContent.join(', ')}{' '}
                        {job.file.excludedByContent.length === 1 ? 'was' : 'were'} excluded on the strength of the
                        values alone — the heading did not say so.
                      </>
                    )}
                  </span>
                </p>
              )}
              {/* The exclusion panel above already states this in full; repeating it
                  as a warning buries the warnings that need attention. */}
              {job.file.warnings
                .filter((warning) => !/^Excluded by (name|content):/.test(warning))
                .map((warning, index) => (
                  <p
                    key={index}
                    className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-ink"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={2.2} />
                    {warning}
                  </p>
                ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              step={3}
              title="Detected columns"
              description="Change any mapping and every query is rebuilt immediately. Rows already processed keep their result."
            />
            <div className="grid gap-x-8 gap-y-5 px-7 py-6 md:grid-cols-2 xl:grid-cols-3">
              {job.file.headers.map((header) => {
                const role = job.file.detectedRoles[header];
                const excluded = role === 'sensitive_excluded';
                return (
                  <div key={header}>
                    <label
                      className="field-label truncate"
                      htmlFor={`role-${header}`}
                      title={header}
                    >
                      {header}
                    </label>
                    {excluded ? (
                      <div className="flex items-center gap-2 rounded-lg border border-good/30 bg-good-soft px-3 py-2 text-sm text-good">
                        <ShieldCheck className="size-4" strokeWidth={2.2} />
                        Excluded — protected identifier
                      </div>
                    ) : (
                      <Select
                        id={`role-${header}`}
                        value={role}
                        disabled={busy}
                        onChange={(event) => changeRole(header, event.target.value as ColumnRole)}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              step={4}
              title="Run"
              description={`${settings.bulkConcurrency} rows at a time · ${settings.deepScan ? 'deep scan' : 'fast scan'} · ${settings.runBudgetMs / 1000}s budget per row. Change these in Settings.`}
              actions={
                <>
                  {job.status === 'running' && (
                    <Button size="sm" onClick={pause}>
                      <Pause className="size-3.5" strokeWidth={2.4} />
                      Pause
                    </Button>
                  )}
                  {job.status === 'paused' && (
                    <Button size="sm" variant="primary" onClick={resume}>
                      <Play className="size-3.5" strokeWidth={2.4} />
                      Resume
                    </Button>
                  )}
                  {(job.status === 'idle' || job.status === 'stopped') && counts.pending > 0 && (
                    <Button size="sm" variant="primary" onClick={() => void drive()}>
                      <Play className="size-3.5" strokeWidth={2.4} />
                      {job.status === 'stopped' ? 'Continue' : 'Start'}
                    </Button>
                  )}
                  {busy && (
                    <Button size="sm" variant="danger" onClick={stop}>
                      <Square className="size-3.5" strokeWidth={2.4} />
                      Stop
                    </Button>
                  )}
                  {!busy && counts.failed > 0 && (
                    <Button size="sm" onClick={retryFailed}>
                      <RefreshCw className="size-3.5" strokeWidth={2.4} />
                      Retry {counts.failed} failed
                    </Button>
                  )}
                  {!busy && done > 0 && (
                    <Button size="sm" onClick={restart}>
                      <RotateCcw className="size-3.5" strokeWidth={2.4} />
                      Restart
                    </Button>
                  )}
                </>
              }
            />
            <div className="space-y-5 px-7 py-6" data-tick={tick}>
              <div>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-ink">
                    {done} of {totalWork} rows processed
                  </span>
                  <span className="flex items-center gap-2 text-ink-faint">
                    {job.status === 'running' && <Spinner className="size-3.5" />}
                    {job.status}
                  </span>
                </div>
                <ProgressBar
                  value={done}
                  total={totalWork}
                  tone={counts.failed > 0 && done === totalWork ? 'warn' : 'accent'}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatTile label="Complete" value={counts.succeeded} tone="good" />
                <StatTile label="Partial" value={counts.partial} tone={counts.partial ? 'warn' : 'neutral'} />
                <StatTile label="Failed" value={counts.failed} tone={counts.failed ? 'bad' : 'neutral'} />
                <StatTile label="Pending" value={counts.pending} />
                <StatTile label="Skipped" value={counts.skipped} />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              step={5}
              title="Rows"
              description="Select a row to see the full result, the live route it took, and the evidence behind every value."
              actions={
                <div className="flex flex-wrap gap-1 rounded-lg bg-panel-sunken p-1">
                  {FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFilter(option.id)}
                      className={`rounded-md px-2.5 py-1 text-[13px] font-semibold transition-colors ${
                        filter === option.id ? 'bg-panel-raised text-ink shadow-sm' : 'text-ink-faint hover:text-ink'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              }
            />
            {visibleRows.length === 0 ? (
              <EmptyState title="No rows match this filter" body="Choose a different filter to see the other rows." />
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-panel-sunken">
                    <tr className="text-xs tracking-wide text-ink-faint uppercase">
                      <th className="px-7 py-2.5 font-semibold">Row</th>
                      <th className="px-3 py-2.5 font-semibold">Query used</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Found</th>
                      <th className="px-7 py-2.5 text-right font-semibold">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.rowId}
                        onClick={() => setOpenRow(row.result ? row.rowId : null)}
                        className={`border-t border-line ${row.result ? 'cursor-pointer hover:bg-panel-sunken' : ''}`}
                      >
                        <td className="px-7 py-2.5 font-mono text-xs text-ink-faint tabular-nums">{row.rowNumber}</td>
                        <td className="max-w-[24rem] truncate px-3 py-2.5 text-ink" title={row.queryBasis}>
                          {row.query || <span className="text-ink-faint italic">{row.skipReason}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={STATUS_TONE[row.status]}>
                            {row.status === 'processing' && <Spinner className="size-3" />}
                            {row.status}
                          </Badge>
                        </td>
                        <td className="max-w-[22rem] truncate px-3 py-2.5 text-ink-soft">
                          {row.error ? (
                            <span className="text-bad">{row.error}</span>
                          ) : row.result ? (
                            [
                              row.result.phones[0]?.formatted,
                              row.result.emails[0]?.email,
                              row.result.website?.replace(/^https?:\/\//, ''),
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'nothing recovered'
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-7 py-2.5 text-right font-mono text-xs text-ink-faint tabular-nums">
                          {row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {errorRows.length > 0 && (
            <Panel className="border-bad/25">
              <PanelHeader
                step={6}
                title={`Errors (${errorRows.length})`}
                description="Every failure is reported exactly as it happened. No row is filled in with a guess."
              />
              <ul className="space-y-2 px-7 py-6">
                {errorRows.map((row) => (
                  <li key={row.rowId} className="rounded-lg border border-line bg-panel-raised px-4 py-2.5 text-sm">
                    <span className="font-mono text-xs text-ink-faint">Row {row.rowNumber}</span>{' '}
                    <span className="font-medium text-ink">{row.query}</span>
                    <p className="text-ink-soft">{row.error}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel>
            <PanelHeader
              step={7}
              title="Export"
              description="Original columns are copied through untouched; enrichment is appended in prefixed columns. Excluded columns are absent from both formats."
              actions={
                <>
                  <Button size="sm" onClick={() => exportBulkJob(job, 'csv')} disabled={done === 0}>
                    <Download className="size-3.5" strokeWidth={2.4} />
                    CSV
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => exportBulkJob(job, 'xlsx')} disabled={done === 0}>
                    <Download className="size-3.5" strokeWidth={2.4} />
                    XLSX
                  </Button>
                </>
              }
            />
            <p className="px-7 py-5 text-sm text-ink-soft">
              {done === 0
                ? 'Process at least one row to enable the export.'
                : `${job.rows.length} rows will be written, ${done} of them enriched.`}
            </p>
          </Panel>
        </>
      )}

      {detailRow?.result && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Result for row ${detailRow.rowNumber}`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 sm:p-8"
          onClick={() => setOpenRow(null)}
        >
          <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <Panel>
              <PanelHeader
                title={`Row ${detailRow.rowNumber}`}
                description={detailRow.queryBasis}
                actions={
                  <Button size="sm" onClick={() => setOpenRow(null)}>
                    Close
                  </Button>
                }
              />
              <ResultPanel result={detailRow.result} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
