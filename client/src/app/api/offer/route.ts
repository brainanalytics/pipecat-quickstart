import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json(); // SDP/body from the client
  const base = process.env.BACKEND_BASE_URL!;
  console.log("body", body);
  console.log("base", base);
  const r = await fetch(`${base}/api/offer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
