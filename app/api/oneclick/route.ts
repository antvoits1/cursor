import { NextResponse } from "next/server";
import JSZip from "jszip";
import {
  ONECLICK_FILENAME,
  ONECLICK_ZIP_FILENAME,
  buildInstallReadme,
  buildOneClickVbs,
  normalizeAppUrl,
} from "@/lib/oneclick";

function appUrlFromRequest(request: Request) {
  const incoming = new URL(request.url);
  const override = incoming.searchParams.get("url");
  if (override) return normalizeAppUrl(override);

  const hostHeader =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    incoming.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (incoming.protocol === "https:" ? "https" : "http");
  const host = hostHeader
    .replace(/^0\.0\.0\.0/, "127.0.0.1")
    .replace(/^\[::\]/, "127.0.0.1");
  return normalizeAppUrl(`${proto}://${host}`);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const appUrl = appUrlFromRequest(request);
  const vbs = buildOneClickVbs(appUrl);
  const format = incoming.searchParams.get("format") || "zip";

  if (format === "vbs") {
    return new NextResponse(vbs, {
      headers: {
        "Content-Type": "text/vbscript; charset=utf-8",
        "Content-Disposition": `attachment; filename="${ONECLICK_FILENAME}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const zip = new JSZip();
  zip.file(ONECLICK_FILENAME, vbs);
  zip.file("INSTALL.txt", buildInstallReadme(appUrl));
  const bytes = await zip.generateAsync({ type: "uint8array" });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ONECLICK_ZIP_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
