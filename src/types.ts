/**
 * Shared contract between the React frontend, the Express/serverless API layer,
 * and the TypeScript extraction engine. Every field below is produced by real
 * engine code — there are no placeholder or decorative fields.
 */

export type LineType = 'MOBILE' | 'LANDLINE' | 'VOIP' | 'TOLL_FREE' | 'UNKNOWN';

export type QueryType =
  | 'domain_direct'
  | 'url_direct'
  | 'facebook_page'
  | 'phone_first'
  | 'email_first'
  | 'person_and_company'
  | 'owner_first'
  | 'location_constrained'
  | 'address_first'
  | 'natural_language_prompt'
  | 'company_search';

/** Transport tiers, in escalation order. */
export type TransportTier =
  | 'cache'
  | 'curl_cffi'
  | 'patchright'
  | 'camoufox'
  | 'node_http';

export type TransportMode = 'layered_python' | 'node_http_only';

/** A single user-facing line in the live extraction route. */
export type RouteStepKind =
  | 'input'
  | 'classification'
  | 'context'
  | 'plan'
  | 'discovery'
  | 'cache'
  | 'transport'
  | 'retry'
  | 'redirect'
  | 'timeout'
  | 'network_error'
  | 'http_block'
  | 'challenge'
  | 'js_shell'
  | 'escalation'
  | 'parse'
  | 'accepted'
  | 'rejected'
  | 'merge'
  | 'validation'
  | 'agreement'
  | 'selection'
  | 'learning'
  | 'failure'
  | 'timing'
  | 'summary';

export type RouteStepStatus = 'info' | 'success' | 'warning' | 'error' | 'skipped';

export interface RouteStep {
  /** Monotonic step index within a single extraction run. */
  seq: number;
  kind: RouteStepKind;
  status: RouteStepStatus;
  /** Short plain-language sentence shown to the operator. */
  message: string;
  /** Milliseconds since the run started. */
  atMs: number;
  /** Wall-clock duration of the operation this step describes, when measurable. */
  durationMs?: number;
  tier?: TransportTier;
  url?: string;
  sourceLabel?: string;
  /** Structured detail for the expandable technical view. */
  detail?: Record<string, string | number | boolean>;
}

/** One transport attempt against one URL, as reported by the transport layer. */
export interface TransportAttempt {
  tier: TransportTier;
  ok: boolean;
  status?: number;
  blocked?: boolean;
  challenge?: string;
  dynamicShell?: boolean;
  redirects?: number;
  timedOut?: boolean;
  reason?: string;
  elapsedMs?: number;
}

export interface TransportOutcome {
  ok: boolean;
  url?: string;
  html?: string;
  tier?: TransportTier;
  status?: number;
  fromCache: boolean;
  blocked: boolean;
  reason?: string;
  attempts: TransportAttempt[];
  totalMs: number;
}

/** Where a value was seen. Every accepted value carries at least one. */
export interface Evidence {
  url: string;
  sourceLabel: string;
  /** How the value was located on the page. */
  method: 'json_ld' | 'microdata' | 'meta_tag' | 'anchor_href' | 'text_pattern' | 'search_snippet' | 'dns_record';
  /** Trimmed excerpt of the surrounding text, for operator inspection. */
  excerpt?: string;
  tier?: TransportTier;
  observedAt: string;
}

/** One signal that argued for a line type, kept so the verdict can be audited. */
export interface LineTypeSignal {
  source: 'numbering_plan' | 'carrier_lookup' | 'people_search_label' | 'page_context' | 'prefix_heuristic' | 'assistant';
  says: LineType;
  weight: number;
  detail: string;
  sourceUrl?: string;
}

export interface PhoneInfo {
  /** E.164 */
  number: string;
  formatted: string;
  type: LineType;
  lineTypeConfidence: number;
  lineTypeBasis: string;
  /** Every signal that was weighed to reach `type`. */
  lineTypeSignals: LineTypeSignal[];
  carrier?: string;
  /** Caller ID name, where a source published one. */
  callerIdName?: string;
  location?: string;
  timezone?: string;
  country: string;
  /** Number of independent sources that reported this exact number. */
  agreementCount: number;
  confidence: number;
  /**
   * How likely this is the number that actually reaches the person, 0-100.
   * Distinct from `confidence`, which is only about the number being real.
   */
  reachabilityScore: number;
  reachabilityBasis: string[];
  /** Rank among this contact's numbers, 1 being the best bet. */
  rank: number;
  /** Whether a source presented this as current rather than historical. */
  recency?: 'current' | 'prior' | 'unknown';
  evidence: Evidence[];
}

export type EmailKind = 'role' | 'personal' | 'sales' | 'support' | 'info' | 'unknown';

/**
 * Result of checking an address, tier by tier.
 *
 * Each field is a three-state: true, false, or null meaning the check could not
 * be run here. A check that could not run is never reported as a pass.
 */
export interface EmailVerification {
  syntaxValid: boolean;
  /** The domain resolves and publishes mail exchangers. */
  domainHasMx: boolean | null;
  hasSpf: boolean | null;
  hasDmarc: boolean | null;
  /** Domain belongs to a known throwaway-mail provider. */
  disposable: boolean;
  /** Local part is a shared function mailbox rather than a person. */
  roleAccount: boolean;
  /** Domain accepts every address, so a per-mailbox check proves nothing. */
  catchAll: boolean | null;
  /** SMTP RCPT probe. Null when outbound port 25 is unavailable, as on serverless. */
  smtpAccepted: boolean | null;
  smtpDetail?: string;
  verdict: 'deliverable' | 'probably_deliverable' | 'risky' | 'undeliverable' | 'unverifiable';
  /** Plain-language reasons behind the verdict, in the order they were applied. */
  basis: string[];
}

export interface EmailInfo {
  email: string;
  kind: EmailKind;
  domain: string;
  /** True when the email domain matches the resolved official website domain. */
  domainMatchesWebsite: boolean;
  deliverability: 'high' | 'medium' | 'low' | 'unknown';
  deliverabilityBasis: string;
  verification: EmailVerification;
  agreementCount: number;
  confidence: number;
  evidence: Evidence[];
}

export interface AddressInfo {
  full: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  agreementCount: number;
  confidence: number;
  evidence: Evidence[];
}

export interface SocialLink {
  platform: 'Facebook' | 'LinkedIn' | 'Instagram' | 'X' | 'YouTube' | 'TikTok' | 'Other';
  url: string;
  handle?: string;
  evidence: Evidence[];
}

export interface OwnerInfo {
  name: string;
  role?: string;
  confidence: number;
  evidence: Evidence[];
}

export type PersonRelation = 'spouse' | 'relative' | 'associate' | 'household' | 'unknown';

export interface RelatedPerson {
  name: string;
  relation: PersonRelation;
  age?: number;
  /** Profile on the same source, so their numbers can be pulled on request. */
  profileUrl?: string;
}

/**
 * A person as one people-search source describes them.
 *
 * Kept whole and per-source rather than merged into the business record,
 * because two sources disagreeing about someone's current address is
 * information the operator needs to see, not something to average away.
 */
export interface PersonRecord {
  name: string;
  age?: number;
  /** The address the source presents as current. */
  currentAddress?: AddressInfo;
  priorAddresses: AddressInfo[];
  phones: PhoneInfo[];
  emails: EmailInfo[];
  relatives: RelatedPerson[];
  /** Where the record came from, e.g. "TruePeopleSearch". */
  sourceLabel: string;
  sourceUrl: string;
  /** How well this record matches the person that was asked for, 0-100. */
  matchScore: number;
  matchBasis: string[];
  observedAt: string;
}

export interface DnsIntelligence {
  domain: string;
  mailProvider?: string;
  mxRecords: string[];
  spfRecord?: string;
  dmarcRecord?: string;
  detectedServices: string[];
  deliverabilityScore: number;
  ipAddress?: string;
  hasValidMx: boolean;
  hasSpf: boolean;
  hasDmarc: boolean;
}

/**
 * Use of the optional language-model layer on a run.
 *
 * The assistant is only ever asked to interpret a query or to pull structure out
 * of text that was actually fetched. It is never asked for a fact, so every
 * value it returns still carries the URL it came from.
 */
export interface AssistantUsage {
  provider: 'gemini' | 'grok' | 'none';
  model?: string;
  /** What it was used for on this run. */
  tasks: Array<'query_interpretation' | 'page_extraction' | 'line_type_reasoning'>;
  callCount: number;
  totalMs: number;
  /** Set when the assistant was wanted but could not be used. */
  unavailableReason?: string;
}

/** A value the engine saw but refused to output, with the reason why. */
export interface RejectedValue {
  field: 'phone' | 'email' | 'address' | 'website' | 'owner' | 'social';
  value: string;
  reason: string;
  sourceUrl?: string;
}

export interface ConsultedSource {
  url: string;
  label: string;
  kind: 'search' | 'official_site' | 'social' | 'directory' | 'registry' | 'people_directory' | 'dns';
  tier?: TransportTier;
  ok: boolean;
  status?: number;
  blocked: boolean;
  reason?: string;
  fieldsFound: string[];
  elapsedMs: number;
}

/** An extra place to look, saved on the server and editable from Settings. */
export interface CustomSource {
  id: string;
  /** What to call it in the route, e.g. "NY corporation register". */
  label: string;
  /** The address, with `{name}`-style placeholders left in place. */
  url: string;
  enabled: boolean;
  addedAt: string;
}

/** What a run knows about the lead, used to fill saved-source placeholders. */
export interface QueryContext {
  query: string;
  companyName?: string;
  personName?: string;
  city?: string;
  state?: string;
  zip?: string;
  domain?: string;
  phone?: string;
  email?: string;
}

/** One site that would not let the run in, described without jargon. */
export interface BlockReport {
  /** Bare host, e.g. "yellowpages.com". */
  site: string;
  /** What happened, in words a non-technical reader can act on. */
  what: string;
  /** Whether the run got the information despite the refusal. */
  gotAround: boolean;
  /** How, when it did. */
  instead?: string;
}

export interface QueryPlan {
  originalInput: string;
  normalizedInput: string;
  queryType: QueryType;
  /** Context the engine inferred from the input, never invented. */
  inferredContext: {
    companyName?: string;
    personName?: string;
    city?: string;
    state?: string;
    zip?: string;
    domain?: string;
    phone?: string;
    email?: string;
    url?: string;
  };
  /** Ordered route plan. Order reflects locally learned performance. */
  routes: PlannedRoute[];
  notes: string[];
}

export interface PlannedRoute {
  id: string;
  label: string;
  purpose: string;
  order: number;
  /** Locally learned success rate for this route/query-type pair, if any. */
  learnedSuccessRate?: number;
  learnedSampleSize?: number;
  enabled: boolean;
  skipReason?: string;
}

export type EntityMatchStatus =
  | 'VERIFIED_MATCH'
  | 'PROBABLE_MATCH'
  | 'CONFLICTING_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

export interface ExtractionResult {
  id: string;
  query: string;
  queryType: QueryType;
  plan: QueryPlan;

  /** Absent when the input was a bare address and no source supplied a name. */
  companyName?: string;
  website: string;
  industry?: string;
  description?: string;

  phones: PhoneInfo[];
  emails: EmailInfo[];
  addresses: AddressInfo[];
  socials: SocialLink[];
  owner?: OwnerInfo;

  /** Whole person records from people-search sources, kept per source. */
  people: PersonRecord[];

  dnsIntelligence?: DnsIntelligence;

  /** How the assistant layer was used on this run, if at all. */
  assistant?: AssistantUsage;

  /** Full user-facing live route for this run. Never shared between runs. */
  route: RouteStep[];
  consultedSources: ConsultedSource[];
  /** One plain-English line per site that refused the run. */
  blocks: BlockReport[];
  rejected: RejectedValue[];

  confidence: number;
  confidenceBasis: string[];
  entityMatchStatus: EntityMatchStatus;
  status: 'success' | 'partial' | 'failed';
  failureReason?: string;

  transportMode: TransportMode;
  availableTiers: TransportTier[];

  durationMs: number;
  createdAt: string;

  /** Untouched columns from the originating spreadsheet row, if any. */
  preservedFields?: Record<string, string | number>;
  /** Stable identifier of the originating spreadsheet row, if any. */
  rowId?: string;
}

/* ---------------------------------- Bulk ---------------------------------- */

export type BulkRowStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'partial'
  | 'failed'
  | 'skipped';

export interface BulkRow {
  rowId: string;
  /** 1-based position in the original sheet, excluding the header. */
  rowNumber: number;
  /** Original cells exactly as parsed, minus excluded sensitive columns. */
  original: Record<string, string | number>;
  /** Cells that were excluded from every pipeline (e.g. SSN). Never sent anywhere. */
  excludedColumns: string[];
  /** The query the engine will run for this row. */
  query: string;
  /** Human-readable explanation of how the query was assembled. */
  queryBasis: string;
  status: BulkRowStatus;
  skipReason?: string;
  result?: ExtractionResult;
  error?: string;
  durationMs?: number;
}

export interface BulkFileInfo {
  filename: string;
  extension: 'csv' | 'xlsx' | 'xls';
  sheetName: string;
  totalSheetRows: number;
  usableRows: number;
  skippedRows: number;
  headers: string[];
  detectedRoles: Record<string, ColumnRole>;
  excludedColumns: string[];
  /** Excluded because the heading names a protected identifier. */
  excludedByName: string[];
  /** Excluded because the values look like a protected identifier even though the heading does not say so. */
  excludedByContent: string[];
  warnings: string[];
}

export type ColumnRole =
  | 'company'
  | 'owner'
  | 'first_name'
  | 'last_name'
  | 'phone'
  | 'email'
  | 'website'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'sensitive_excluded'
  | 'preserved';

export interface BulkJob {
  id: string;
  name: string;
  file: BulkFileInfo;
  rows: BulkRow[];
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
  processed: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
  startedAt?: string;
  endedAt?: string;
  deepScan: boolean;
}

/* ------------------------------- Diagnostics ------------------------------ */

export interface TierAvailability {
  tier: TransportTier;
  available: boolean;
  detail: string;
}

export interface RouteLearningRecord {
  key: string;
  queryType: QueryType;
  routeId: string;
  attempts: number;
  successes: number;
  failures: number;
  blocks: number;
  successRate: number;
  avgLatencyMs: number;
  avgFieldYield: number;
  lastOutcome: 'success' | 'failure' | 'blocked' | 'none';
  lastSeenAt?: string;
}

export interface DomainLearningRecord {
  domain: string;
  attempts: number;
  successes: number;
  blocks: number;
  successRate: number;
  avgLatencyMs: number;
  phoneYield: number;
  emailYield: number;
  addressYield: number;
  ownerYield: number;
  /** Patterns that produced accepted values on this domain. */
  productivePatterns: string[];
  /** Patterns that repeatedly produced nothing or rejected values. */
  unproductivePatterns: string[];
  lastSeenAt?: string;
  /** Learned entries are revalidated rather than trusted indefinitely. */
  staleAfter: string;
}

export interface LearningSnapshot {
  enabled: boolean;
  totalRuns: number;
  routes: RouteLearningRecord[];
  domains: DomainLearningRecord[];
  updatedAt?: string;
}

export interface EngineDiagnostics {
  /** 'online' is only reported once a real extraction has completed on this process. */
  status: 'online' | 'degraded' | 'starting' | 'offline';
  statusDetail: string;
  build: string;
  version: string;
  host: 'node_server' | 'vercel_function';
  transportMode: TransportMode;
  tiers: TierAvailability[];
  cache: {
    kind: 'sqlite_transport' | 'in_process' | 'none';
    available: boolean;
    detail: string;
    entries?: number;
    hits: number;
    misses: number;
  };
  totalExtractions: number;
  successfulExtractions: number;
  failedExtractions: number;
  uptimeSeconds: number;
  learning: LearningSnapshot;
  recentRuns: DiagnosticRunSummary[];
}

export interface DiagnosticRunSummary {
  id: string;
  query: string;
  queryType: QueryType;
  status: 'success' | 'partial' | 'failed';
  confidence: number;
  durationMs: number;
  tiersUsed: TransportTier[];
  blocked: boolean;
  at: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
