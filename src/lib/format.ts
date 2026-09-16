import type { Lead } from '../data/types';

export function money(n: number | null | undefined): string {
  return '$' + Math.round(Number(n || 0)).toLocaleString('en-US');
}

export function approval(lead: Pick<Lead, 'avg'>): number {
  return (lead.avg || 0) + 150000;
}

export function phoneHref(number: string): string {
  return '+1' + String(number || '').replace(/\D/g, '');
}

export function whatsappHref(number: string): string {
  return 'https://wa.me/' + phoneHref(number).replace('+', '');
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
