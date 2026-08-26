import { ExternalLink } from 'lucide-react';
import type { ConsultedSource, Evidence, ExtractionResult } from '../types';
import { Badge, EmptyState } from './ui';

/**
 * Evidence and source ledger.
 *
 * The top table is every value the engine accepted with the exact place it saw
 * it. The lower tables are the values it refused and the sources it consulted,
 * including the ones that blocked it — a source that failed is as much a part of
 * the record as one that worked.
 */

const METHOD_LABEL: Record<Evidence['method'], string> = {
  json_ld: 'Structured data',
  microdata: 'Microdata',
  meta_tag: 'Meta tag',
  anchor_href: 'Link target',
  text_pattern: 'Page text',
  search_snippet: 'Search snippet',
  dns_record: 'DNS record',
};

interface EvidenceLine {
  field: string;
  value: string;
  evidence: Evidence;
}

function collect(result: ExtractionResult): EvidenceLine[] {
  const lines: EvidenceLine[] = [];
  const push = (field: string, value: string, evidence: Evidence[]) => {
    for (const item of evidence) lines.push({ field, value, evidence: item });
  };
  for (const phone of result.phones) push('Phone', phone.formatted, phone.evidence);
  for (const email of result.emails) push('Email', email.email, email.evidence);
  for (const address of result.addresses) push('Address', address.full, address.evidence);
  for (const social of result.socials) push(social.platform, social.url, social.evidence);
  if (result.owner) push('Owner', result.owner.name, result.owner.evidence);
  return lines;
}

function SourceRow({ source }: { source: ConsultedSource }) {
  const tone = source.blocked ? 'bad' : source.ok ? 'good' : 'warn';
  const label = source.blocked ? 'blocked' : source.ok ? 'read' : 'no data';
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2.5 pr-4">
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex max-w-[26rem] items-center gap-1.5 truncate text-accent hover:underline"
        >
          <span className="truncate">{source.label}</span>
          <ExternalLink className="size-3 shrink-0" strokeWidth={2.2} />
        </a>
        <div className="max-w-[26rem] truncate font-mono text-[11px] text-ink-faint">{source.url}</div>
      </td>
      <td className="py-2.5 pr-4 text-ink-soft capitalize">{source.kind.replace(/_/g, ' ')}</td>
      <td className="py-2.5 pr-4 text-ink-soft">{source.tier ?? '—'}</td>
      <td className="py-2.5 pr-4">
        <Badge tone={tone}>{label}</Badge>
      </td>
      <td className="py-2.5 pr-4 text-ink-soft">
        {source.fieldsFound.length > 0 ? source.fieldsFound.join(', ') : source.reason ? source.reason : '—'}
      </td>
      <td className="py-2.5 text-right font-mono text-ink-soft tabular-nums">{source.elapsedMs} ms</td>
    </tr>
  );
}

export function EvidencePanel({ result }: { result: ExtractionResult }) {
  const lines = collect(result);

  return (
    <div className="space-y-8 px-7 py-6">
      <section>
        <h3 className="section-title mb-2.5">Accepted values and where they were seen ({lines.length})</h3>
        {lines.length === 0 ? (
          <EmptyState
            title="No values were accepted"
            body="Nothing met the evidence bar on this run, so there is nothing to attribute."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel-raised">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs tracking-wide text-ink-faint uppercase">
                  <th className="px-4 py-2.5 font-semibold">Field</th>
                  <th className="px-4 py-2.5 font-semibold">Value</th>
                  <th className="px-4 py-2.5 font-semibold">Found by</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.field}-${line.value}-${index}`} className="border-t border-line align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">{line.field}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">{line.value}</td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {METHOD_LABEL[line.evidence.method]}
                      {line.evidence.excerpt && (
                        <div className="mt-0.5 max-w-md truncate text-xs text-ink-faint italic">
                          “{line.evidence.excerpt}”
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={line.evidence.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block max-w-[20rem] truncate text-accent hover:underline"
                      >
                        {line.evidence.sourceLabel}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.rejected.length > 0 && (
        <section>
          <h3 className="section-title mb-2.5">Values the engine refused ({result.rejected.length})</h3>
          <ul className="space-y-2">
            {result.rejected.map((item, index) => (
              <li
                key={`${item.field}-${item.value}-${index}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-line bg-panel-raised px-4 py-2.5 text-sm"
              >
                <Badge tone="neutral">{item.field}</Badge>
                <span className="font-medium text-ink">{item.value}</span>
                <span className="text-ink-faint">— {item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="section-title mb-2.5">Sources consulted ({result.consultedSources.length})</h3>
        {result.consultedSources.length === 0 ? (
          <EmptyState title="No sources were consulted" body="The run ended before any source was reached." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel-raised px-4">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs tracking-wide text-ink-faint uppercase">
                  <th className="py-2.5 pr-4 font-semibold">Source</th>
                  <th className="py-2.5 pr-4 font-semibold">Kind</th>
                  <th className="py-2.5 pr-4 font-semibold">Tier</th>
                  <th className="py-2.5 pr-4 font-semibold">Outcome</th>
                  <th className="py-2.5 pr-4 font-semibold">Fields / reason</th>
                  <th className="py-2.5 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {result.consultedSources.map((source, index) => (
                  <SourceRow key={`${source.url}-${index}`} source={source} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
