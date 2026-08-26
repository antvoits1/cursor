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

export interface PhoneInfo {
  /** E.164 */
  number: string;
  formatted: string;
  type: LineType;
  lineTypeConfidence: number;
  lineTypeBasis: string;
  carrier?: string;
  location?: string;
  timezone?: string;
  country: string;
  /** Number of independent sources that reported this exact number. */
  agreementCount: number;
  confidence: number;
  evidence: Evidence[];
}

export type EmailKind = 'role' | 'personal' | 'sales' | 'support' | 'info' | 'unknown';

export interface EmailInfo {
  email: string;
  kind: EmailKind;
  domain: string;
  /** True when the email domain matches the resolved official website domain. */
  domainMatchesWebsite: boolean;
  deliverability: 'high' | 'medium' | 'low' | 'unknown';
  deliverabilityBasis: string;
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

  dnsIntelligence?: DnsIntelligence;

  /** Full user-facing live route for this run. Never shared between runs. */
  route: RouteStep[];
  consultedSources: ConsultedSource[];
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
