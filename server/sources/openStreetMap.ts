import { fetchPage } from '../transport.js';
import type { RouteTrace } from '../trace.js';

/**
 * OpenStreetMap / Nominatim lookup.
 *
 * OSM carries operator-maintained records for a very large number of physical
 * businesses, including the phone, website, and postal address as structured
 * fields. That makes it a far more reliable first-party-adjacent source than a
 * scraped search results page, and it is openly licensed public data.
 */

const NOMINATIM_BASE = process.env.EXTRACTOR_NOMINATIM_BASE ?? 'https://nominatim.openstreetmap.org';

export interface OsmPlace {
  name: string;
  displayName: string;
  category?: string;
  type?: string;
  phone?: string;
  website?: string;
  email?: string;
  wikidataId?: string;
  address: {
    houseNumber?: string;
    road?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  formattedAddress: string;
  sourceUrl: string;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface NominatimResult {
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  osm_type?: string;
  osm_id?: number;
  address?: NominatimAddress;
  extratags?: Record<string, string>;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function formatAddress(address: NominatimAddress | undefined): string {
  if (!address) return '';
  const city = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.suburb;
  const state = address.state ? (STATE_ABBREVIATIONS[address.state.toLowerCase()] ?? address.state) : undefined;
  const street = [address.house_number, address.road].filter(Boolean).join(' ');
  const tail = [city, [state, address.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, tail].filter(Boolean).join(', ');
}

function firstTag(tags: Record<string, string> | undefined, keys: string[]): string | undefined {
  if (!tags) return undefined;
  for (const key of keys) {
    const value = tags[key];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Looks up a business by name and optional location. Returns every matching
 * place so the caller can cross-check agreement between branches rather than
 * silently trusting the first hit.
 */
export async function lookupPlaces(
  name: string,
  location: string | undefined,
  trace: RouteTrace,
  limit = 5,
): Promise<OsmPlace[]> {
  const query = [name, location].filter(Boolean).join(', ').trim();
  if (!query) return [];

  const url =
    `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&addressdetails=1&extratags=1&limit=${limit}`;

  trace.info('discovery', `Looking up "${query}" in the OpenStreetMap business register...`, {
    sourceLabel: 'OpenStreetMap',
  });

  const outcome = await fetchPage(url, { label: 'the OpenStreetMap business register', trace, timeoutMs: 12000 });
  if (!outcome.ok || !outcome.html) {
    trace.warn('discovery', `The OpenStreetMap register could not be read: ${outcome.reason ?? 'no response'}.`, {
      sourceLabel: 'OpenStreetMap',
    });
    return [];
  }

  let parsed: NominatimResult[];
  try {
    parsed = JSON.parse(outcome.html) as NominatimResult[];
  } catch {
    trace.warn('discovery', 'The OpenStreetMap register returned a response that could not be read as data.', {
      sourceLabel: 'OpenStreetMap',
    });
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    trace.info('discovery', `OpenStreetMap has no register entry matching "${query}".`, { sourceLabel: 'OpenStreetMap' });
    return [];
  }

  const places = parsed.map<OsmPlace>((entry) => ({
    name: entry.name ?? '',
    displayName: entry.display_name ?? '',
    category: entry.category,
    type: entry.type,
    phone: firstTag(entry.extratags, ['phone', 'contact:phone', 'contact:mobile']),
    website: firstTag(entry.extratags, ['website', 'contact:website', 'url']),
    email: firstTag(entry.extratags, ['email', 'contact:email']),
    wikidataId: firstTag(entry.extratags, ['wikidata', 'brand:wikidata']),
    address: {
      houseNumber: entry.address?.house_number,
      road: entry.address?.road,
      city: entry.address?.city ?? entry.address?.town ?? entry.address?.village ?? entry.address?.suburb,
      state: entry.address?.state,
      postcode: entry.address?.postcode,
      country: entry.address?.country,
    },
    formattedAddress: formatAddress(entry.address),
    sourceUrl: entry.osm_type && entry.osm_id
      ? `https://www.openstreetmap.org/${entry.osm_type}/${entry.osm_id}`
      : `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}`,
  }));

  const withContact = places.filter((p) => p.phone ?? p.website ?? p.formattedAddress).length;
  trace.success(
    'discovery',
    `OpenStreetMap returned ${places.length} matching location${places.length === 1 ? '' : 's'}, ${withContact} with contact details.`,
    { sourceLabel: 'OpenStreetMap', detail: { matches: places.length, withContact } },
  );

  return places;
}
