import { NextResponse } from "next/server";
import { RPC_FALLBACKS, RPC_URL } from "@/config/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC relay for the browser. The public Robinhood RPC's
 * rate-limit responses carry a malformed CORS header, which the browser
 * reports as a CORS failure; relaying from here removes that path.
 * Fallbacks are tried in order.
 */
const ENDPOINTS = [RPC_URL, ...RPC_FALLBACKS];

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 200_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let lastError = "no endpoint answered";
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        lastError = `${url} answered ${res.status}`;
        continue;
      }
      const text = await res.text();
      return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch (e) {
      lastError = `${url}: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: lastError } }, { status: 502 });
}
