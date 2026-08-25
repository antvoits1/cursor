import { NextResponse } from "next/server";
import JSZip from "jszip";
import {
  ONECLICK_FILENAME,
  ONECLICK_ZIP_FILENAME,
  buildInstallReadme,
  buildOneClickVbs,
  normalizeAppUrl,
} from "@/lib/oneclick";

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const appUrl = normalizeAppUrl(incoming.searchParams.get("url") || incoming.origin);
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
