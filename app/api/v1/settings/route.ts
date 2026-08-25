import { NextResponse } from "next/server";
import { settings } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    proxy_configured: Boolean(settings.proxy_url),
    proxy_display: "",
    cache_ttl_days: settings.cache_ttl_days,
    smtp_checks: settings.smtp_checks,
    max_concurrency: settings.max_concurrency,
    max_phone_seeds: settings.max_phone_seeds,
    snapshots_enabled: settings.snapshots_enabled,
  });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Record<string, unknown>;
  if (typeof payload.cache_ttl_days === "number") settings.cache_ttl_days = payload.cache_ttl_days;
  if (typeof payload.max_concurrency === "number") settings.max_concurrency = payload.max_concurrency;
  if (typeof payload.max_phone_seeds === "number") settings.max_phone_seeds = payload.max_phone_seeds;
  if (typeof payload.smtp_checks === "boolean") settings.smtp_checks = payload.smtp_checks;
  if (typeof payload.snapshots_enabled === "boolean") settings.snapshots_enabled = payload.snapshots_enabled;
  return NextResponse.json({ ok: true, saved: Object.keys(payload).sort() });
}
