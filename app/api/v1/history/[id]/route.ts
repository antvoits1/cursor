import { NextResponse } from "next/server";
import { getHistory, deleteHistory } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const dossier = getHistory(Number(id));
  if (!dossier) return NextResponse.json({ detail: "Dossier not found" }, { status: 404 });
  return NextResponse.json(dossier);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!deleteHistory(Number(id))) return NextResponse.json({ detail: "Dossier not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
