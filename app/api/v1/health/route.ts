import { ENGINE_VERSION } from "@/lib/dossier";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine_version: ENGINE_VERSION,
    schema_version: 2,
    playwright: false,
    dns: true,
    bulk: { xlsx: false, pdf: false, ocr: false },
    pwa: true,
  });
}
