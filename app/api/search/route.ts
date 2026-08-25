import { NextResponse } from "next/server";
import { scrapePage, searchTheWeb } from "@/lib/search-web";

export const runtime = "nodejs";
export const maxDuration = 60;

type SseSender = (event: string, data: unknown) => void;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Enter anything in the search box." }, { status: 400 });
  }
  if (query.length > 200) {
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SseSender = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send("status", { message: "Searching the web…" });
        const { hits, wiki, instant, errors } = await searchTheWeb(query);
        send("instant", instant);
        send("wiki", wiki);
        send("results", { hits, errors });
        send("status", { message: `Scraping ${Math.min(hits.length, 8)} pages…` });

        const batch = hits.slice(0, 8);
        const pages = await Promise.all(batch.map((hit) => scrapePage(hit)));
        for (const page of pages) {
          send("page", page);
        }
        send("done", { query, pages: pages.length });
      } catch (error) {
        console.error("search failed", error);
        send("fail", {
          message: error instanceof Error ? error.message : "Search failed",
        });
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
    },
  });
}
