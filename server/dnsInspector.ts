import dns from 'node:dns/promises';
import type { DnsIntelligence } from '../src/types.js';

const MAIL_PROVIDERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /aspmx\.l\.google\.com|googlemail\.com|google\.com$/i, name: 'Google Workspace' },
  { pattern: /outlook\.com|protection\.outlook|office365|microsoft/i, name: 'Microsoft 365' },
  { pattern: /zoho/i, name: 'Zoho Mail' },
  { pattern: /protonmail|proton\.ch|protonmail\.ch/i, name: 'Proton Mail' },
  { pattern: /icloud|apple\.com$/i, name: 'Apple iCloud Mail' },
  { pattern: /mimecast/i, name: 'Mimecast' },
  { pattern: /barracuda/i, name: 'Barracuda' },
  { pattern: /proofpoint|pphosted/i, name: 'Proofpoint' },
  { pattern: /secureserver\.net|godaddy/i, name: 'GoDaddy Email' },
  { pattern: /emailsrvr\.com|rackspace/i, name: 'Rackspace Email' },
  { pattern: /mailgun/i, name: 'Mailgun' },
  { pattern: /sendgrid/i, name: 'Twilio SendGrid' },
  { pattern: /messagingengine\.com|fastmail/i, name: 'Fastmail' },
  { pattern: /titan\.email|flockmail/i, name: 'Titan Email' },
  { pattern: /improvmx/i, name: 'ImprovMX forwarding' },
  { pattern: /hostinger|hostgator|bluehost|dreamhost|siteground|ionos|namecheap|privateemail/i, name: 'Shared web-host mail' },
];

const SPF_SERVICES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /_spf\.google\.com/i, name: 'Google Workspace' },
  { pattern: /spf\.protection\.outlook\.com/i, name: 'Microsoft 365' },
  { pattern: /hubspotemail\.net/i, name: 'HubSpot' },
  { pattern: /_spf\.salesforce\.com/i, name: 'Salesforce' },
  { pattern: /sendgrid\.net/i, name: 'SendGrid' },
  { pattern: /mailgun\.org/i, name: 'Mailgun' },
  { pattern: /klaviyomail\.com/i, name: 'Klaviyo' },
  { pattern: /mailchimpapp\.net|mcsv\.net|servers\.mcsv\.net/i, name: 'Mailchimp' },
  { pattern: /zendesk\.com/i, name: 'Zendesk' },
  { pattern: /intercom-mail\.com/i, name: 'Intercom' },
  { pattern: /mktomail\.com/i, name: 'Marketo' },
  { pattern: /freshdesk\.com/i, name: 'Freshdesk' },
  { pattern: /activehosted\.com/i, name: 'ActiveCampaign' },
  { pattern: /constantcontact\.com/i, name: 'Constant Contact' },
  { pattern: /amazonses\.com/i, name: 'Amazon SES' },
  { pattern: /_spf\.qualtrics\.com/i, name: 'Qualtrics' },
  { pattern: /servers\.mcsv\.net/i, name: 'Mandrill' },
];

export function normaliseDomain(domainOrUrl: string): string | null {
  let value = String(domainOrUrl ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  value = value.replace(/^www\./, '').split('/')[0].split(':')[0].replace(/\.$/, '');
  if (!value.includes('.') || value.length < 4) return null;
  return value;
}

/**
 * Reads public DNS records for the resolved domain. This is used only to judge
 * whether an email address could plausibly be delivered — it never invents an
 * address and never marks an unverified address as verified.
 */
export async function inspectDomainDns(domainOrUrl: string): Promise<DnsIntelligence | null> {
  const domain = normaliseDomain(domainOrUrl);
  if (!domain) return null;

  const intel: DnsIntelligence = {
    domain,
    mxRecords: [],
    detectedServices: [],
    deliverabilityScore: 25,
    hasValidMx: false,
    hasSpf: false,
    hasDmarc: false,
  };

  const [aResult, mxResult, txtResult, dmarcResult] = await Promise.allSettled([
    dns.resolve4(domain),
    dns.resolveMx(domain),
    dns.resolveTxt(domain),
    dns.resolveTxt(`_dmarc.${domain}`),
  ]);

  if (aResult.status === 'fulfilled' && aResult.value.length > 0) {
    intel.ipAddress = aResult.value[0];
    intel.deliverabilityScore += 5;
  }

  if (mxResult.status === 'fulfilled' && mxResult.value.length > 0) {
    const sorted = [...mxResult.value].sort((a, b) => a.priority - b.priority);
    intel.mxRecords = sorted.map((m) => m.exchange);
    intel.hasValidMx = true;
    intel.deliverabilityScore += 35;
    for (const record of sorted) {
      const provider = MAIL_PROVIDERS.find((p) => p.pattern.test(record.exchange));
      if (provider) {
        intel.mailProvider = provider.name;
        if (!intel.detectedServices.includes(provider.name)) intel.detectedServices.push(provider.name);
        break;
      }
    }
    if (!intel.mailProvider) intel.mailProvider = 'Self-managed or unrecognised mail host';
  }

  if (txtResult.status === 'fulfilled') {
    for (const chunks of txtResult.value) {
      const entry = chunks.join('');
      if (!entry.toLowerCase().startsWith('v=spf1')) continue;
      intel.spfRecord = entry;
      intel.hasSpf = true;
      intel.deliverabilityScore += 20;
      for (const service of SPF_SERVICES) {
        if (service.pattern.test(entry) && !intel.detectedServices.includes(service.name)) {
          intel.detectedServices.push(service.name);
        }
      }
    }
  }

  if (dmarcResult.status === 'fulfilled') {
    const dmarc = dmarcResult.value.map((c) => c.join('')).find((v) => v.toLowerCase().includes('v=dmarc1'));
    if (dmarc) {
      intel.dmarcRecord = dmarc;
      intel.hasDmarc = true;
      intel.deliverabilityScore += 15;
    }
  }

  intel.deliverabilityScore = Math.min(intel.deliverabilityScore, 100);
  return intel;
}
