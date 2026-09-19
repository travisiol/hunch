import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { PERP_MARKETS } from "@/config/assets";
import { RPC_FALLBACKS, RPC_URL, robinhoodChain } from "@/config/chains";
import { CONTRACTS } from "@/config/contracts";
import { aggregatorAbi } from "@/lib/abi/aggregator";
import { perpEngineAbi } from "@/lib/abi/perpEngine";
import { predictionMarketAbi } from "@/lib/abi/predictionMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: { at: number; body: unknown } | null = null;
const TTL_MS = 15_000;

/**
 * What the landing shows live: the latest Chainlink print of every perp
 * asset, the open interest of the engine, and the first open prediction
 * market with its pools. One multicall, cached for 15 s.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.body, { headers: { "cache-control": "no-store" } });
  const endpoints = [RPC_URL, ...RPC_FALLBACKS];
  let lastError = "";
  for (const endpoint of endpoints) {
    try {
      const client = createPublicClient({ chain: robinhoodChain, transport: http(endpoint, { batch: true, timeout: 15_000 }) });
      const feeds = await client.multicall({
        contracts: PERP_MARKETS.map((a) => ({ address: a.priceFeed, abi: aggregatorAbi, functionName: "latestRoundData" as const })),
        allowFailure: true,
      });
      const prices = PERP_MARKETS.map((a, i) => {
        const r = feeds[i];
        return { symbol: a.symbol, name: a.name, price: r.status === "success" ? r.result[1].toString() : null, updatedAt: r.status === "success" ? Number(r.result[3]) : null };
      });

      let openInterest = "0";
      let market: { id: number; question: string; yesPool: string; noPool: string; resolutionTime: number } | null = null;
      let marketCount = 0;
      if (CONTRACTS.perpEngine && CONTRACTS.predictionMarket) {
        const engine = await client.multicall({
          contracts: PERP_MARKETS.map((_, i) => ({ address: CONTRACTS.perpEngine as `0x${string}`, abi: perpEngineAbi, functionName: "getMarket" as const, args: [i] as const })),
          allowFailure: true,
        });
        openInterest = engine.reduce((acc, r) => (r.status === "success" ? acc + r.result.longOpenInterest + r.result.shortOpenInterest : acc), 0n).toString();
        const count = await client.readContract({ address: CONTRACTS.predictionMarket, abi: predictionMarketAbi, functionName: "marketCount" });
        marketCount = Number(count);
        const n = Math.min(marketCount, 30);
        if (n > 0) {
          const markets = await client.multicall({
            contracts: Array.from({ length: n }, (_, i) => ({ address: CONTRACTS.predictionMarket as `0x${string}`, abi: predictionMarketAbi, functionName: "getMarket" as const, args: [BigInt(i)] as const })),
            allowFailure: true,
          });
          const now = Math.floor(Date.now() / 1000);
          const open = markets
            .map((r) => (r.status === "success" ? r.result : undefined))
            .filter((m) => m && !m.resolved && Number(m.resolutionTime) > now)
            .sort((a, b) => Number(b!.yesPool + b!.noPool - (a!.yesPool + a!.noPool)));
          const pick = open[0];
          if (pick) market = { id: Number(pick.id), question: pick.question, yesPool: pick.yesPool.toString(), noPool: pick.noPool.toString(), resolutionTime: Number(pick.resolutionTime) };
        }
      }
      const body = { at: Date.now(), prices, openInterest, marketCount, market };
      cached = { at: Date.now(), body };
      return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      lastError = (e as Error).message.split("\n")[0];
    }
  }
  return NextResponse.json({ error: `Could not read the chain: ${lastError}` }, { status: 502 });
}
