import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { ASSET_BY_SYMBOL } from "@/config/assets";
import { RPC_FALLBACKS, RPC_URL, robinhoodChain } from "@/config/chains";
import { aggregatorAbi } from "@/lib/abi/aggregator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POINTS = 120;
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 25_000;

/**
 * The oracle's own history. Chainlink round ids are phase-prefixed
 * (phase << 64 | round), so walking back from the latest round stays inside
 * the current phase; we stop at the first round that does not exist.
 */
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol.toUpperCase().replace(/-PERP$/, "");
  const asset = ASSET_BY_SYMBOL[symbol];
  if (!asset) return NextResponse.json({ error: `Unknown asset ${symbol}` }, { status: 404 });
  const url = new URL(req.url);
  const points = Math.min(MAX_POINTS, Math.max(2, Number(url.searchParams.get("points") ?? 60) || 60));
  const key = `${symbol}:${points}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body, { headers: { "cache-control": "no-store" } });

  const endpoints = [RPC_URL, ...RPC_FALLBACKS];
  let lastError = "";
  for (const endpoint of endpoints) {
    try {
      const client = createPublicClient({ chain: robinhoodChain, transport: http(endpoint, { batch: true, timeout: 15_000 }) });
      const latest = await client.readContract({ address: asset.priceFeed, abi: aggregatorAbi, functionName: "latestRoundData" });
      const latestId = latest[0];
      const ids: bigint[] = [];
      for (let i = 0n; i < BigInt(points); i++) {
        if (latestId < i) break;
        ids.push(latestId - i);
      }
      const rounds = await client.multicall({
        contracts: ids.map((id) => ({ address: asset.priceFeed, abi: aggregatorAbi, functionName: "getRoundData" as const, args: [id] as const })),
        allowFailure: true,
      });
      const candles = rounds
        .map((r) => (r.status === "success" ? r.result : undefined))
        .filter((r): r is NonNullable<typeof r> => Boolean(r) && r![1] > 0n && r![3] > 0n)
        .map((r) => ({ t: Number(r[3]), p: r[1].toString() }))
        .reverse();
      const body = { symbol, feed: asset.priceFeed, decimals: 8, points, candles };
      cache.set(key, { at: Date.now(), body });
      return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      lastError = (e as Error).message.split("\n")[0];
    }
  }
  return NextResponse.json({ error: `Could not read the feed: ${lastError}` }, { status: 502 });
}
