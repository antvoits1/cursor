import type { Dossier } from "./dossier";

type HistoryRow = {
  id: number;
  cache_key: string;
  query_text: string;
  company_name: string;
  state: string;
  phones_count: number;
  emails_count: number;
  engine_version: string;
  updated_at: string;
  dossier: Dossier;
};

const history: HistoryRow[] = [];
let nextId = 1;

export const settings = {
  proxy_url: "",
  cache_ttl_days: 7,
  smtp_checks: false,
  max_concurrency: 5,
  max_phone_seeds: 4,
  snapshots_enabled: false,
};

export function saveDossier(dossier: Dossier) {
  const row: HistoryRow = {
    id: nextId++,
    cache_key: dossier.cache_key,
    query_text: dossier.query,
    company_name: dossier.entity.name,
    state: dossier.entity.state,
    phones_count: dossier.entity.phones.length,
    emails_count: dossier.entity.emails.length,
    engine_version: dossier.engine_version,
    updated_at: new Date().toISOString(),
    dossier,
  };
  history.unshift(row);
  if (history.length > 60) history.pop();
  return row;
}

export function listHistory() {
  return history.map((row) => ({
    id: row.id,
    cache_key: row.cache_key,
    query_text: row.query_text,
    company_name: row.company_name,
    state: row.state,
    phones_count: row.phones_count,
    emails_count: row.emails_count,
    engine_version: row.engine_version,
    updated_at: row.updated_at,
  }));
}

export function getHistory(id: number) {
  return history.find((row) => row.id === id)?.dossier || null;
}

export function deleteHistory(id: number) {
  const index = history.findIndex((row) => row.id === id);
  if (index < 0) return false;
  history.splice(index, 1);
  return true;
}

export function clearHistory() {
  history.length = 0;
}
