import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.BACKEND_BASE_URL!;
  const r = await fetch(`${base}/start`, { method: "GET" });
  const data = await r.json(); // should be { webrtcUrl: "..." } from your Python server
  return NextResponse.json(data, { status: r.status });
}
