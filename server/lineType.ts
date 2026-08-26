import { parsePhoneNumber } from 'libphonenumber-js';
import type { LineType, LineTypeSignal } from '../src/types.js';

/**
 * Deciding whether a number is a mobile or a landline.
 *
 * In North America this cannot be answered from the number alone. Local number
 * portability means a number allocated to a landline block in 1998 may have
 * been carried to a mobile carrier years ago, and tens of millions have been.
 * Any single signal is therefore a guess.
 *
 * So the answer is assembled from every signal available, each with a weight
 * reflecting how much it actually proves, and the verdict is reported together
 * with the signals that produced it. A caller who needs certainty can read the
 * signals; a caller who needs a decision gets one, with an honest confidence.
 *
 * Ranked by how much they prove:
 *
 *  1. A people-search page that explicitly labels the number "Wireless" or
 *     "Landline". These sites buy carrier data, so the label reflects a real
 *     lookup, and it is the best free signal that exists.
 *  2. A carrier lookup that names the operator, where the operator is known to
 *     be mobile-only or landline-only.
 *  3. Page context: "Mobile:", "Cell:", "Fax:" next to the number.
 *  4. Numbering-plan metadata, which for the US is close to useless and is
 *     weighted accordingly, but is meaningful in most other countries.
 */

/** Carriers that only operate mobile networks in North America. */
const MOBILE_ONLY_CARRIERS = [
  'verizon wireless', 't-mobile', 'tmobile', 'at&t mobility', 'att mobility', 'sprint', 'metropcs',
  'metro by t-mobile', 'cricket', 'boost mobile', 'us cellular', 'uscellular', 'tracfone', 'straight talk',
  'mint mobile', 'google fi', 'visible', 'xfinity mobile', 'spectrum mobile', 'consumer cellular',
  'simple mobile', 'total wireless', 'net10', 'h2o wireless', 'ting', 'republic wireless', 'wireless',
  'cellco partnership', 'new cingular wireless', 'omnipoint', 'powertel', 'aerial communications',
];

/** Carriers and operator types that only provide fixed lines. */
const LANDLINE_ONLY_CARRIERS = [
  'centurylink', 'frontier communications', 'windstream', 'consolidated communications', 'cincinnati bell',
  'verizon new england', 'verizon virginia', 'pacific bell', 'southwestern bell', 'ameritech', 'bellsouth',
  'nynex', 'us west', 'qwest', 'citizens telecom', 'tds telecom', 'hargray', 'lumen',
];

/** Operators that are VoIP resellers rather than mobile or fixed-line carriers. */
const VOIP_CARRIERS = [
  'bandwidth.com', 'twilio', 'level 3', 'level3', 'onvoy', 'inteliquent', 'peerless network',
  'vonage', 'magicjack', 'ringcentral', 'dialpad', 'grasshopper', 'google voice', 'voip', 'sinch',
  'telnyx', 'plivo', 'nextiva', '8x8', 'ooma', 'callcentric', 'flowroute', 'teleport communications',
];

function carrierClass(carrier: string): LineType | null {
  const lowered = carrier.toLowerCase();
  if (VOIP_CARRIERS.some((name) => lowered.includes(name))) return 'VOIP';
  if (MOBILE_ONLY_CARRIERS.some((name) => lowered.includes(name))) return 'MOBILE';
  if (LANDLINE_ONLY_CARRIERS.some((name) => lowered.includes(name))) return 'LANDLINE';
  return null;
}

/**
 * Reads an explicit line-type label from a people-search page.
 *
 * These sites render the type as a word next to the number, and the wording is
 * consistent enough across them to match directly.
 */
export function labelToLineType(label: string): LineType | null {
  const lowered = label.toLowerCase();
  if (/\b(?:wireless|mobile|cell(?:ular)?|cell phone)\b/.test(lowered)) return 'MOBILE';
  if (/\b(?:landline|land line|home phone|residential|fixed line|wireline)\b/.test(lowered)) return 'LANDLINE';
  if (/\b(?:voip|internet phone|non-fixed voip|virtual)\b/.test(lowered)) return 'VOIP';
  if (/\btoll[\s-]?free\b/.test(lowered)) return 'TOLL_FREE';
  return null;
}

const TOLL_FREE_AREA_CODES = new Set(['800', '833', '844', '855', '866', '877', '888', '822', '880', '887', '889']);

export interface LineTypeInput {
  /** E.164 number. */
  number: string;
  /** Text immediately around the number on the page it was found on. */
  context?: string;
  /** A label a people-search page attached to the number, e.g. "Wireless". */
  publishedLabel?: string;
  publishedLabelSourceUrl?: string;
  /** Operator name, from a carrier lookup or a people-search page. */
  carrier?: string;
  carrierSourceUrl?: string;
}

export interface LineTypeVerdict {
  type: LineType;
  confidence: number;
  basis: string;
  signals: LineTypeSignal[];
  carrier?: string;
}

/**
 * Weighs every available signal and returns one verdict.
 *
 * Weights are the point of this function. A published carrier label is worth
 * far more than numbering-plan metadata, and the confidence that comes out
 * reflects the strength of what was actually available rather than a fixed
 * number per branch.
 */
export function resolveLineType(input: LineTypeInput): LineTypeVerdict {
  const signals: LineTypeSignal[] = [];
  const digits = input.number.replace(/\D/g, '');
  const national = digits.startsWith('1') ? digits.slice(1) : digits;
  const areaCode = national.slice(0, 3);

  if (TOLL_FREE_AREA_CODES.has(areaCode)) {
    const signal: LineTypeSignal = {
      source: 'numbering_plan',
      says: 'TOLL_FREE',
      weight: 100,
      detail: `Area code ${areaCode} is reserved for toll-free service, which is not assigned to individuals.`,
    };
    return {
      type: 'TOLL_FREE',
      confidence: 99,
      basis: signal.detail,
      signals: [signal],
    };
  }

  // 1. A published label from a source that buys carrier data.
  if (input.publishedLabel) {
    const says = labelToLineType(input.publishedLabel);
    if (says) {
      signals.push({
        source: 'people_search_label',
        says,
        weight: 55,
        detail: `A public records source labels this number "${input.publishedLabel.trim()}".`,
        sourceUrl: input.publishedLabelSourceUrl,
      });
    }
  }

  // 2. The operator, where its name settles the question.
  if (input.carrier) {
    const says = carrierClass(input.carrier);
    if (says) {
      signals.push({
        source: 'carrier_lookup',
        says,
        weight: 40,
        detail: `The number is carried by ${input.carrier.trim()}, which operates ${
          says === 'MOBILE' ? 'a mobile network' : says === 'VOIP' ? 'as a VoIP provider' : 'fixed lines'
        }.`,
        sourceUrl: input.carrierSourceUrl,
      });
    }
  }

  // 3. How the page presented the number.
  if (input.context) {
    const lowered = input.context.toLowerCase();
    if (/\b(?:mobile|cell(?:ular)?|cell phone|text|sms|whatsapp)\b/.test(lowered)) {
      signals.push({
        source: 'page_context',
        says: 'MOBILE',
        weight: 22,
        detail: 'The page presents this number as a mobile or text-capable line.',
      });
    } else if (/\b(?:office|landline|main line|reception|front desk|switchboard|tel|telephone)\b/.test(lowered)) {
      signals.push({
        source: 'page_context',
        says: 'LANDLINE',
        weight: 18,
        detail: 'The page presents this number as an office or main line.',
      });
    }
  }

  // 4. Numbering-plan metadata. Genuinely informative outside North America,
  //    close to meaningless inside it because of number portability.
  try {
    const parsed = parsePhoneNumber(input.number);
    const planType = parsed?.getType();
    const country = parsed?.country;
    const portable = country === 'US' || country === 'CA';
    if (planType === 'MOBILE') {
      signals.push({
        source: 'numbering_plan',
        says: 'MOBILE',
        weight: portable ? 8 : 45,
        detail: portable
          ? 'The numbering plan lists this range as mobile, though US numbers move between carriers freely.'
          : 'The national numbering plan reserves this range for mobile service.',
      });
    } else if (planType === 'FIXED_LINE') {
      signals.push({
        source: 'numbering_plan',
        says: 'LANDLINE',
        weight: portable ? 8 : 45,
        detail: portable
          ? 'The numbering plan lists this range as fixed line, though US numbers move between carriers freely.'
          : 'The national numbering plan reserves this range for fixed lines.',
      });
    } else if (planType === 'VOIP') {
      signals.push({
        source: 'numbering_plan',
        says: 'VOIP',
        weight: 25,
        detail: 'The numbering plan lists this range as VoIP.',
      });
    }
  } catch {
    /* an unparseable number simply contributes no plan signal */
  }

  if (signals.length === 0) {
    return {
      type: 'UNKNOWN',
      confidence: 0,
      basis: 'Nothing available said whether this is a mobile or a landline, so it is left unstated rather than guessed.',
      signals: [],
      carrier: input.carrier,
    };
  }

  const totals = new Map<LineType, number>();
  for (const signal of signals) {
    totals.set(signal.says, (totals.get(signal.says) ?? 0) + signal.weight);
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const [winner, winningWeight] = ranked[0];
  const runnerUpWeight = ranked[1]?.[1] ?? 0;
  const totalWeight = [...totals.values()].reduce((sum, weight) => sum + weight, 0);

  // Confidence reflects both how strong the winning evidence is and how much of
  // the evidence disagreed with it.
  const share = winningWeight / totalWeight;
  const margin = (winningWeight - runnerUpWeight) / Math.max(winningWeight, 1);
  const confidence = Math.round(Math.min(97, winningWeight * share * (0.6 + 0.4 * margin)));

  const deciding = signals.filter((signal) => signal.says === winner).sort((a, b) => b.weight - a.weight)[0];
  const dissent = signals.filter((signal) => signal.says !== winner);
  const basis =
    dissent.length > 0
      ? `${deciding.detail} A weaker signal disagreed: ${dissent[0].detail.charAt(0).toLowerCase()}${dissent[0].detail.slice(1)}`
      : deciding.detail;

  return { type: winner, confidence, basis, signals, carrier: input.carrier };
}

export interface ReachabilityInput {
  lineType: LineType;
  lineTypeConfidence: number;
  agreementCount: number;
  recency?: 'current' | 'prior' | 'unknown';
  /** True when a people-search record listed this first among a person's numbers. */
  listedFirst?: boolean;
  isFax?: boolean;
}

/**
 * Scores how likely a number is to actually reach the person, 0-100.
 *
 * This is a different question from whether the number is real. A disconnected
 * landline published on three directories is a real number that will not reach
 * anyone; a mobile seen once on a current record probably will.
 */
export function scoreReachability(input: ReachabilityInput): { score: number; basis: string[] } {
  const basis: string[] = [];
  let score = 40;

  if (input.isFax) {
    return { score: 2, basis: ['The number is published as a fax line, so it will not reach a person.'] };
  }

  if (input.lineType === 'MOBILE') {
    const bonus = Math.round(30 * (input.lineTypeConfidence / 100));
    score += bonus;
    basis.push(`Identified as a mobile line (+${bonus}), which reaches a person directly.`);
  } else if (input.lineType === 'LANDLINE') {
    score += 5;
    basis.push('Identified as a landline (+5), which typically reaches a location rather than a person.');
  } else if (input.lineType === 'VOIP') {
    score -= 5;
    basis.push('Identified as a VoIP line (-5), which is often unattended or reassigned.');
  } else if (input.lineType === 'TOLL_FREE') {
    score -= 10;
    basis.push('A toll-free number reaches a business queue rather than an individual (-10).');
  } else {
    basis.push('The line type could not be established, so no adjustment was made for it.');
  }

  if (input.agreementCount > 1) {
    const bonus = Math.min(18, (input.agreementCount - 1) * 7);
    score += bonus;
    basis.push(`${input.agreementCount} independent sources published this number (+${bonus}).`);
  }

  if (input.recency === 'current') {
    score += 15;
    basis.push('A source presents this as the current number (+15).');
  } else if (input.recency === 'prior') {
    score -= 25;
    basis.push('A source presents this as a previous number rather than a current one (-25).');
  }

  if (input.listedFirst) {
    score += 8;
    basis.push('Listed first among this person’s numbers, which these sources order by recency (+8).');
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), basis };
}
