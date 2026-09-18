export function digitsOnly(value: string): string { return String(value || '').replace(/[^\d+]/g, ''); }
export function whatsappHref(number: string, text = ''): string {
  const digits = String(number || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export function ageMinutes(value: string): number {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return Number.MAX_SAFE_INTEGER;
  if (text.includes('just now') || text === 'now') return 0;
  const relative = text.match(/(\d+(?:\.\d+)?)\s*(m|h|d|w)(?:\s*ago)?/);
  if (relative) {
    const amount = Number(relative[1]);
    if (relative[2] === 'm') return amount;
    if (relative[2] === 'h') return amount * 60;
    if (relative[2] === 'd') return amount * 1440;
    return amount * 10080;
  }
  if (text.startsWith('today')) return 60;
  if (text.startsWith('yesterday')) return 1440;
  const weekdays = ['sun','mon','tue','wed','thu','fri','sat'];
  const weekday = weekdays.findIndex(day => text.startsWith(day));
  if (weekday >= 0) {
    const now = new Date();
    let daysAgo = (now.getDay() - weekday + 7) % 7;
    if (daysAgo === 0) daysAgo = 7;
    return daysAgo * 1440;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return Math.max(0, (Date.now() - parsed) / 60000);
  return Number.MAX_SAFE_INTEGER - 1;
}
export function newestByTime<T>(items: T[], getTime: (item: T) => string): T[] {
  return [...items].sort((a,b) => ageMinutes(getTime(a)) - ageMinutes(getTime(b)));
}
export function oldestByTime<T>(items: T[], getTime: (item: T) => string): T[] {
  return [...items].sort((a,b) => ageMinutes(getTime(b)) - ageMinutes(getTime(a)));
}
