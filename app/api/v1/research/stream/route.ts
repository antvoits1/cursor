import { NextResponse } from "next/server";
import type { Dossier } from "@/lib/dossier";
import { runResearch } from "@/lib/research-engine";
import { saveDossier } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ detail: "Enter a company, person, email, phone, domain or URL." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of runResearch(query)) {
          controller.enqueue(encoder.encode(chunk));
          if (chunk.includes('"type": "COMPLETE"') || chunk.includes('"type":"COMPLETE"')) {
            try {
              const line = chunk.replace(/^data:\s*/, "").trim();
              const event = JSON.parse(line) as { data?: Dossier };
              if (event.data?.entity) saveDossier(event.data);
            } catch (error) {
              console.error("history save failed", error);
            }
          }
        }
      } catch (error) {
        console.error("research stream failed", error);
        const message = error instanceof Error ? error.message : "Research failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ timestamp: new Date().toISOString(), type: "ERROR", message, data: {} })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
