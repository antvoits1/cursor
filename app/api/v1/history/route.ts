import { NextResponse } from "next/server";
import { clearHistory, listHistory } from "@/lib/store";

export async function GET() {
  return NextResponse.json(listHistory());
}

export async function DELETE() {
  clearHistory();
  return NextResponse.json({ ok: true });
}
