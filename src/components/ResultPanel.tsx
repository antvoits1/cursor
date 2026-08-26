import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { ExtractionResult, Evidence, EntityMatchStatus } from '../types';
import { Badge, EmptyState, type Tone } from './ui';

/**
 * The structured result.
 *
 * Every value shown here came from a source the engine actually read; the
 * evidence count next to a value is the number of independent sources that
 * reported it. Nothing is filled in when a source did not provide it.
 */

const MATCH_TONE: Record<EntityMatchStatus, Tone> = {
  VERIFIED_MATCH: 'good',
  PROBABLE_MATCH: 'accent',
  CONFLICTING_EVIDENCE: 'warn',
  INSUFFICIENT_EVIDENCE: 'neutral',
};

const MATCH_LABEL: Record<EntityMatchStatus, string> = {
  VERIFIED_MATCH: 'Verified match',
  PROBABLE_MATCH: 'Probable match',
  CONFLICTING_EVIDENCE: 'Conflicting evidence',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};

function confidenceTone(confidence: number): Tone {
  if (confidence >= 75) return 'good';
  if (confidence >= 45) return 'accent';
  if (confidence >= 25) return 'warn';
  return 'bad';
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => setCopied(false));
      }}
      className="rounded-md p-1 text-ink-faint transition-colors hover:bg-panel-sunken hover:text-ink"
    >
      {copied ? <Check className="size-3.5 text-good" strokeWidth={2.6} /> : <Copy className="size-3.5" strokeWidth={2.2} />}
    </button>
  );
}

function EvidenceCount({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return null;
  const hosts = [...new Set(evidence.map((e) => e.sourceLabel))];
  return (
    <span
      className="text-xs text-ink-faint"
      title={hosts.join('\n')}
    >
      {evidence.length} {evidence.length === 1 ? 'sighting' : 'sightings'} across {hosts.length}{' '}
      {hosts.length === 1 ? 'source' : 'sources'}
    </span>
  );
}

function ValueRow({
  primary,
  secondary,
  meta,
  href,
  copyValue,
  copyLabel,
  evidence,
}: {
  primary: string;
  secondary?: string;
  meta?: React.ReactNode;
  href?: string;
  copyValue: string;
  copyLabel: string;
  evidence: Evidence[];
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-panel-raised px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate font-medium text-accent hover:underline"
            >
              {primary}
            </a>
          ) : (
            <span className="truncate font-medium text-ink">{primary}</span>
          )}
          <CopyButton value={copyValue} label={copyLabel} />
        </div>
        {secondary && <p className="text-xs text-ink-faint">{secondary}</p>}
        <EvidenceCount evidence={evidence} />
      </div>
      {meta && <div className="flex shrink-0 items-center gap-2">{meta}</div>}
    </li>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="section-title mb-2.5">
        {title} <span className="text-ink-faint/70">({count})</span>
      </h3>
      {children}
    </div>
  );
}

export function ResultPanel({ result }: { result: ExtractionResult }) {
  const nothingFound =
    result.phones.length === 0 &&
    result.emails.length === 0 &&
    result.addresses.length === 0 &&
    result.socials.length === 0 &&
    !result.website &&
    !result.owner;

  return (
    <div className="space-y-7 px-7 py-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold text-ink">
            {result.companyName || result.query}
          </h3>
          {result.website && (
            <a
              href={result.website}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              {result.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink className="size-3.5" strokeWidth={2.2} />
            </a>
          )}
          {result.description && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{result.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={confidenceTone(result.confidence)}>{result.confidence}% confidence</Badge>
          <Badge tone={MATCH_TONE[result.entityMatchStatus]}>{MATCH_LABEL[result.entityMatchStatus]}</Badge>
          <Badge tone={result.status === 'success' ? 'good' : result.status === 'partial' ? 'warn' : 'bad'}>
            {result.status}
          </Badge>
        </div>
      </div>

      {result.failureReason && (
        <p className="rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-ink">
          {result.failureReason}
        </p>
      )}

      {nothingFound ? (
        <EmptyState
          title="No contact data was recovered"
          body="The engine consulted every route in the plan and none of them produced a value it could stand behind. The route below shows exactly where each attempt stopped."
        />
      ) : (
        <div className="grid gap-7 lg:grid-cols-2">
          {result.owner && (
            <Group title="Owner / contact" count={1}>
              <ul className="space-y-2">
                <ValueRow
                  primary={result.owner.name}
                  secondary={result.owner.role}
                  copyValue={result.owner.name}
                  copyLabel="owner name"
                  evidence={result.owner.evidence}
                  meta={<Badge tone={confidenceTone(result.owner.confidence)}>{result.owner.confidence}%</Badge>}
                />
              </ul>
            </Group>
          )}

          {result.phones.length > 0 && (
            <Group title="Phone numbers" count={result.phones.length}>
              <ul className="space-y-2">
                {result.phones.map((phone) => (
                  <ValueRow
                    key={phone.number}
                    primary={phone.formatted}
                    secondary={[phone.location, phone.timezone, phone.lineTypeBasis].filter(Boolean).join(' · ')}
                    href={`tel:${phone.number}`}
                    copyValue={phone.formatted}
                    copyLabel="phone number"
                    evidence={phone.evidence}
                    meta={
                      <>
                        <Badge tone="neutral">{phone.type.replace('_', ' ').toLowerCase()}</Badge>
                        <Badge tone={confidenceTone(phone.confidence)}>{phone.confidence}%</Badge>
                      </>
                    }
                  />
                ))}
              </ul>
            </Group>
          )}

          {result.emails.length > 0 && (
            <Group title="Email addresses" count={result.emails.length}>
              <ul className="space-y-2">
                {result.emails.map((email) => (
                  <ValueRow
                    key={email.email}
                    primary={email.email}
                    secondary={email.deliverabilityBasis}
                    href={`mailto:${email.email}`}
                    copyValue={email.email}
                    copyLabel="email address"
                    evidence={email.evidence}
                    meta={
                      <>
                        <Badge tone={email.domainMatchesWebsite ? 'good' : 'neutral'}>{email.kind}</Badge>
                        <Badge tone={confidenceTone(email.confidence)}>{email.confidence}%</Badge>
                      </>
                    }
                  />
                ))}
              </ul>
            </Group>
          )}

          {result.addresses.length > 0 && (
            <Group title="Addresses" count={result.addresses.length}>
              <ul className="space-y-2">
                {result.addresses.map((address) => (
                  <ValueRow
                    key={address.full}
                    primary={address.full}
                    copyValue={address.full}
                    copyLabel="address"
                    evidence={address.evidence}
                    meta={<Badge tone={confidenceTone(address.confidence)}>{address.confidence}%</Badge>}
                  />
                ))}
              </ul>
            </Group>
          )}

          {result.socials.length > 0 && (
            <Group title="Social and business profiles" count={result.socials.length}>
              <ul className="space-y-2">
                {result.socials.map((social) => (
                  <ValueRow
                    key={social.url}
                    primary={social.handle ?? social.url.replace(/^https?:\/\//, '')}
                    secondary={social.platform}
                    href={social.url}
                    copyValue={social.url}
                    copyLabel="profile link"
                    evidence={social.evidence}
                  />
                ))}
              </ul>
            </Group>
          )}
        </div>
      )}

      {result.dnsIntelligence && (
        <Group title="Domain and mail intelligence" count={1}>
          <dl className="grid gap-x-8 gap-y-2 rounded-lg border border-line bg-panel-raised px-4 py-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Domain</dt>
              <dd className="truncate font-medium text-ink">{result.dnsIntelligence.domain}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Mail provider</dt>
              <dd className="truncate font-medium text-ink">{result.dnsIntelligence.mailProvider ?? 'Not identified'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">MX records</dt>
              <dd className="font-medium text-ink">{result.dnsIntelligence.mxRecords.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">SPF / DMARC</dt>
              <dd className="font-medium text-ink">
                {result.dnsIntelligence.hasSpf ? 'SPF' : 'no SPF'} · {result.dnsIntelligence.hasDmarc ? 'DMARC' : 'no DMARC'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Deliverability score</dt>
              <dd className="font-medium text-ink">{result.dnsIntelligence.deliverabilityScore}/100</dd>
            </div>
            {result.dnsIntelligence.detectedServices.length > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-faint">Detected services</dt>
                <dd className="truncate font-medium text-ink">
                  {result.dnsIntelligence.detectedServices.join(', ')}
                </dd>
              </div>
            )}
          </dl>
        </Group>
      )}

      <Group title="Why this result scored the way it did" count={result.confidenceBasis.length}>
        <ul className="space-y-1.5 rounded-lg border border-line bg-panel-raised px-4 py-3">
          {result.confidenceBasis.map((line, index) => (
            <li key={index} className="flex gap-2 text-sm text-ink-soft">
              <span className="text-ink-faint">·</span>
              {line}
            </li>
          ))}
        </ul>
      </Group>
    </div>
  );
}
