import { parsePhoneNumber } from 'libphonenumber-js/max';
import type { LineType } from '../src/types.js';

/**
 * NANP area code geography.
 *
 * Grouped by region so the data stays readable and auditable. Area codes are
 * used only for location and timezone display; they are never used to guess a
 * line type, because overlays make that unreliable.
 */
const AREA_CODES_BY_REGION: Array<{ region: string; code: string; timezone: string; codes: string[] }> = [
  { region: 'Alabama', code: 'AL', timezone: 'Central (CT)', codes: ['205', '251', '256', '334', '659', '938'] },
  { region: 'Alaska', code: 'AK', timezone: 'Alaska (AKT)', codes: ['907'] },
  { region: 'Arizona', code: 'AZ', timezone: 'Mountain, no DST (MST)', codes: ['480', '520', '602', '623', '928'] },
  { region: 'Arkansas', code: 'AR', timezone: 'Central (CT)', codes: ['479', '501', '870'] },
  { region: 'California', code: 'CA', timezone: 'Pacific (PT)', codes: ['209', '213', '279', '310', '323', '341', '350', '408', '415', '424', '442', '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669', '707', '714', '747', '760', '805', '818', '820', '831', '840', '858', '909', '916', '925', '949', '951'] },
  { region: 'Colorado', code: 'CO', timezone: 'Mountain (MT)', codes: ['303', '719', '720', '970', '983'] },
  { region: 'Connecticut', code: 'CT', timezone: 'Eastern (ET)', codes: ['203', '475', '860', '959'] },
  { region: 'Delaware', code: 'DE', timezone: 'Eastern (ET)', codes: ['302'] },
  { region: 'District of Columbia', code: 'DC', timezone: 'Eastern (ET)', codes: ['202'] },
  { region: 'Florida', code: 'FL', timezone: 'Eastern (ET)', codes: ['239', '305', '321', '352', '386', '407', '448', '561', '656', '689', '727', '754', '772', '786', '813', '850', '863', '904', '941', '954'] },
  { region: 'Georgia', code: 'GA', timezone: 'Eastern (ET)', codes: ['229', '404', '470', '478', '678', '706', '762', '770', '912', '943'] },
  { region: 'Hawaii', code: 'HI', timezone: 'Hawaii (HST)', codes: ['808'] },
  { region: 'Idaho', code: 'ID', timezone: 'Mountain (MT)', codes: ['208', '986'] },
  { region: 'Illinois', code: 'IL', timezone: 'Central (CT)', codes: ['217', '224', '309', '312', '331', '447', '464', '618', '630', '708', '730', '773', '779', '815', '847', '872'] },
  { region: 'Indiana', code: 'IN', timezone: 'Eastern (ET)', codes: ['219', '260', '317', '463', '574', '765', '812', '930'] },
  { region: 'Iowa', code: 'IA', timezone: 'Central (CT)', codes: ['319', '515', '563', '641', '712'] },
  { region: 'Kansas', code: 'KS', timezone: 'Central (CT)', codes: ['316', '620', '785', '913'] },
  { region: 'Kentucky', code: 'KY', timezone: 'Eastern (ET)', codes: ['270', '364', '502', '606', '859'] },
  { region: 'Louisiana', code: 'LA', timezone: 'Central (CT)', codes: ['225', '318', '337', '504', '985'] },
  { region: 'Maine', code: 'ME', timezone: 'Eastern (ET)', codes: ['207'] },
  { region: 'Maryland', code: 'MD', timezone: 'Eastern (ET)', codes: ['227', '240', '301', '410', '443', '667'] },
  { region: 'Massachusetts', code: 'MA', timezone: 'Eastern (ET)', codes: ['339', '351', '413', '508', '617', '774', '781', '857', '978'] },
  { region: 'Michigan', code: 'MI', timezone: 'Eastern (ET)', codes: ['231', '248', '269', '313', '517', '586', '616', '679', '734', '810', '906', '947', '989'] },
  { region: 'Minnesota', code: 'MN', timezone: 'Central (CT)', codes: ['218', '320', '507', '612', '651', '763', '952'] },
  { region: 'Mississippi', code: 'MS', timezone: 'Central (CT)', codes: ['228', '601', '662', '769'] },
  { region: 'Missouri', code: 'MO', timezone: 'Central (CT)', codes: ['235', '314', '417', '557', '573', '636', '660', '816'] },
  { region: 'Montana', code: 'MT', timezone: 'Mountain (MT)', codes: ['406'] },
  { region: 'Nebraska', code: 'NE', timezone: 'Central (CT)', codes: ['308', '402', '531'] },
  { region: 'Nevada', code: 'NV', timezone: 'Pacific (PT)', codes: ['702', '725', '775'] },
  { region: 'New Hampshire', code: 'NH', timezone: 'Eastern (ET)', codes: ['603'] },
  { region: 'New Jersey', code: 'NJ', timezone: 'Eastern (ET)', codes: ['201', '551', '609', '640', '732', '848', '856', '862', '908', '973'] },
  { region: 'New Mexico', code: 'NM', timezone: 'Mountain (MT)', codes: ['505', '575'] },
  { region: 'New York', code: 'NY', timezone: 'Eastern (ET)', codes: ['212', '315', '329', '332', '347', '363', '516', '518', '585', '607', '624', '631', '646', '680', '716', '718', '838', '845', '914', '917', '929', '934'] },
  { region: 'North Carolina', code: 'NC', timezone: 'Eastern (ET)', codes: ['252', '336', '472', '704', '743', '828', '910', '919', '980', '984'] },
  { region: 'North Dakota', code: 'ND', timezone: 'Central (CT)', codes: ['701'] },
  { region: 'Ohio', code: 'OH', timezone: 'Eastern (ET)', codes: ['216', '220', '234', '326', '330', '380', '419', '436', '440', '513', '567', '614', '740', '937'] },
  { region: 'Oklahoma', code: 'OK', timezone: 'Central (CT)', codes: ['405', '539', '572', '580', '918'] },
  { region: 'Oregon', code: 'OR', timezone: 'Pacific (PT)', codes: ['458', '503', '541', '971'] },
  { region: 'Pennsylvania', code: 'PA', timezone: 'Eastern (ET)', codes: ['215', '223', '267', '272', '412', '445', '484', '570', '582', '610', '717', '724', '814', '835', '878'] },
  { region: 'Rhode Island', code: 'RI', timezone: 'Eastern (ET)', codes: ['401'] },
  { region: 'South Carolina', code: 'SC', timezone: 'Eastern (ET)', codes: ['803', '839', '843', '854', '864'] },
  { region: 'South Dakota', code: 'SD', timezone: 'Central (CT)', codes: ['605'] },
  { region: 'Tennessee', code: 'TN', timezone: 'Central (CT)', codes: ['423', '615', '629', '731', '865', '901', '931'] },
  { region: 'Texas', code: 'TX', timezone: 'Central (CT)', codes: ['210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469', '512', '682', '713', '726', '737', '806', '817', '830', '832', '903', '915', '936', '940', '945', '956', '972', '979'] },
  { region: 'Utah', code: 'UT', timezone: 'Mountain (MT)', codes: ['385', '435', '801'] },
  { region: 'Vermont', code: 'VT', timezone: 'Eastern (ET)', codes: ['802'] },
  { region: 'Virginia', code: 'VA', timezone: 'Eastern (ET)', codes: ['276', '434', '540', '571', '703', '757', '804', '826', '948'] },
  { region: 'Washington', code: 'WA', timezone: 'Pacific (PT)', codes: ['206', '253', '360', '425', '509', '564'] },
  { region: 'West Virginia', code: 'WV', timezone: 'Eastern (ET)', codes: ['304', '681'] },
  { region: 'Wisconsin', code: 'WI', timezone: 'Central (CT)', codes: ['262', '274', '353', '414', '534', '608', '715', '920'] },
  { region: 'Wyoming', code: 'WY', timezone: 'Mountain (MT)', codes: ['307'] },
  { region: 'Puerto Rico', code: 'PR', timezone: 'Atlantic (AST)', codes: ['787', '939'] },
];

const AREA_CODE_MAP = new Map<string, { region: string; code: string; timezone: string }>();
for (const entry of AREA_CODES_BY_REGION) {
  for (const code of entry.codes) {
    AREA_CODE_MAP.set(code, { region: entry.region, code: entry.code, timezone: entry.timezone });
  }
}

const TOLL_FREE_AREA_CODES = new Set(['800', '833', '844', '855', '866', '877', '888']);
const PREMIUM_AREA_CODES = new Set(['900', '976']);

/**
 * Context keywords. These come from the page around the number, so they are
 * genuine evidence rather than a guess — but they are always reported with the
 * basis string so an operator can judge them.
 */
const MOBILE_KEYWORDS = ['mobile', 'cell', 'cellular', 'wireless', 'text us', 'sms', 'whatsapp'];
const VOIP_KEYWORDS = ['voip', 'ringcentral', 'nextiva', 'vonage', 'grasshopper', 'ooma', 'dialpad', 'google voice', 'twilio', '8x8'];
const LANDLINE_KEYWORDS = ['landline', 'office', 'main line', 'front desk', 'reception', 'head office', 'headquarters', 'store', 'showroom'];
const FAX_KEYWORDS = ['fax', 'facsimile'];

export interface ClassifiedPhone {
  number: string;
  formatted: string;
  type: LineType;
  lineTypeConfidence: number;
  lineTypeBasis: string;
  carrier?: string;
  location?: string;
  timezone?: string;
  country: string;
  isFax: boolean;
}

function contextHas(context: string, keywords: string[]): string | null {
  const lowered = context.toLowerCase();
  return keywords.find((k) => lowered.includes(k)) ?? null;
}

/**
 * Classifies a phone number using libphonenumber metadata first and page
 * context second. The basis string always states which of the two decided the
 * result so nothing is presented as more certain than it is.
 */
export function classifyPhoneNumber(rawInput: string, contextText = ''): ClassifiedPhone | null {
  if (!rawInput) return null;
  const trimmed = String(rawInput).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  // Reject obvious non-phone digit runs early (dates, IDs, prices).
  if (digits.length < 10 || digits.length > 15) return null;

  let candidate = trimmed;
  if (!trimmed.startsWith('+')) {
    if (digits.length === 10) candidate = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) candidate = `+${digits}`;
  }

  let parsed;
  try {
    parsed = parsePhoneNumber(candidate, 'US');
  } catch {
    return null;
  }
  if (!parsed || !parsed.isValid()) return null;

  const national = parsed.nationalNumber;
  const country = parsed.country ?? 'US';
  const areaCode = country === 'US' || country === 'CA' ? national.slice(0, 3) : '';
  const geo = areaCode ? AREA_CODE_MAP.get(areaCode) : undefined;

  if (PREMIUM_AREA_CODES.has(areaCode)) return null;

  const isFax = Boolean(contextHas(contextText, FAX_KEYWORDS));

  let type: LineType = 'UNKNOWN';
  let lineTypeConfidence = 40;
  let lineTypeBasis = 'The numbering plan does not distinguish this range, and the page gave no hint.';
  let carrier: string | undefined;

  if (TOLL_FREE_AREA_CODES.has(areaCode)) {
    type = 'TOLL_FREE';
    lineTypeConfidence = 99;
    lineTypeBasis = `Area code ${areaCode} is a reserved North American toll-free code.`;
    carrier = 'Toll-free network';
  } else {
    const libType = parsed.getType();
    if (libType === 'MOBILE') {
      type = 'MOBILE';
      lineTypeConfidence = 90;
      lineTypeBasis = 'The numbering-plan metadata marks this range as mobile.';
    } else if (libType === 'FIXED_LINE') {
      type = 'LANDLINE';
      lineTypeConfidence = 88;
      lineTypeBasis = 'The numbering-plan metadata marks this range as a fixed line.';
    } else if (libType === 'VOIP') {
      type = 'VOIP';
      lineTypeConfidence = 88;
      lineTypeBasis = 'The numbering-plan metadata marks this range as VoIP.';
    } else if (libType === 'TOLL_FREE') {
      type = 'TOLL_FREE';
      lineTypeConfidence = 95;
      lineTypeBasis = 'The numbering-plan metadata marks this range as toll-free.';
      carrier = 'Toll-free network';
    }

    // Page context can refine an unknown result, and can override a
    // fixed-line-or-mobile range, but it never overrides toll-free.
    const voipHit = contextHas(contextText, VOIP_KEYWORDS);
    const mobileHit = contextHas(contextText, MOBILE_KEYWORDS);
    const landlineHit = contextHas(contextText, LANDLINE_KEYWORDS);

    if (type === 'UNKNOWN' || libType === 'FIXED_LINE_OR_MOBILE') {
      if (voipHit) {
        type = 'VOIP';
        lineTypeConfidence = 72;
        lineTypeBasis = `The page describes this number near the word "${voipHit}".`;
      } else if (mobileHit) {
        type = 'MOBILE';
        lineTypeConfidence = 74;
        lineTypeBasis = `The page labels this number with "${mobileHit}".`;
      } else if (landlineHit) {
        type = 'LANDLINE';
        lineTypeConfidence = 70;
        lineTypeBasis = `The page labels this number with "${landlineHit}".`;
      } else if (libType === 'FIXED_LINE_OR_MOBILE') {
        type = 'UNKNOWN';
        lineTypeConfidence = 45;
        lineTypeBasis = 'This North American range carries both fixed lines and mobiles, and the page did not say which.';
      }
    }
  }

  return {
    number: parsed.number,
    formatted: parsed.formatNational(),
    type,
    lineTypeConfidence,
    lineTypeBasis,
    carrier,
    location: geo ? `${geo.region} (${geo.code})` : undefined,
    timezone: geo?.timezone,
    country,
    isFax,
  };
}

export function areaCodeCoverage(): number {
  return AREA_CODE_MAP.size;
}
