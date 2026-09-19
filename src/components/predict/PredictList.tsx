"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { Card, CardBody, Empty, Label, PageHeading } from "@/components/ui";
import { CONTRACTS } from "@/config/contracts";
import { predictionMarketAbi } from "@/lib/abi/predictionMarket";
import { countdown, fmtUsdg, impliedOdds } from "@/lib/format";
import { useNow, usePredictionMarketCount, ZERO } from "@/lib/hooks";

const FILTERS = ["All", "Open", "Resolved"] as const;
type Filter = (typeof FILTERS)[number];

export type Market = {
  id: bigint;
  question: string;
  priceFeed: `0x${string}`;
  targetPrice: bigint;
  comparator: number;
  resolutionTime: bigint;
  resolved: boolean;
  outcome: boolean;
  yesPool: bigint;
  noPool: bigint;
};

/** Every market, read in one multicall; refreshed every 15 s. */
export function useMarkets() {
  const { data: count } = usePredictionMarketCount();
  const n = Number(count ?? 0n);
  const { data, isLoading } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: (CONTRACTS.predictionMarket || ZERO) as `0x${string}`,
      abi: predictionMarketAbi,
      functionName: "getMarket" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: n > 0, refetchInterval: 15_000 },
  });
  const markets = useMemo(() => (data ?? []).map((r) => r.result as Market | undefined).filter((m): m is Market => Boolean(m)), [data]);
  return { markets, isLoading: isLoading || (n > 0 && !data), count: n };
}

export function PredictList() {
  const [filter, setFilter] = useState<Filter>("All");
  const { markets, isLoading } = useMarkets();
  const now = useNow();

  const shown = useMemo(
    () => (filter === "Open" ? markets.filter((m) => !m.resolved) : filter === "Resolved" ? markets.filter((m) => m.resolved) : markets),
    [markets, filter],
  );
  const staked = useMemo(() => markets.reduce((acc, m) => acc + m.yesPool + m.noPool, 0n), [markets]);

  return (
    <>
      <PageHeading
        title="Predictions"
        sub="Binary markets on real outcomes. Pick a side, size your conviction, get paid when you are right. No leverage, no liquidation, no margin calls."
      />
      <div className="mb-24 flex flex-wrap items-center justify-between gap-16">
        <div className="flex w-fit border border-line-strong bg-panel">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`hn-label px-18 py-10 transition-colors ${filter === f ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="hn-label">
          {shown.length} markets · staked <span className="hn-num text-ink">{fmtUsdg(staked)} USDG</span>
        </span>
      </div>

      {!CONTRACTS.predictionMarket ? (
        <Empty>Set NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS to load markets</Empty>
      ) : isLoading ? (
        <Empty>Loading markets</Empty>
      ) : shown.length === 0 ? (
        <Empty>No markets in this view</Empty>
      ) : (
        <ul className="grid gap-16 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => {
            const odds = impliedOdds(m.yesPool, m.noPool);
            const closed = m.resolved || (now > 0 && Number(m.resolutionTime) * 1000 <= now);
            return (
              <Card as="li" key={m.id.toString()}>
                <Link href={`/app/predict/${m.id.toString()}`} className="block h-full">
                  <CardBody className="flex h-full flex-col gap-20">
                    <div className="flex items-center justify-between gap-12">
                      <Label>Market {m.id.toString()}</Label>
                      <span
                        className={`hn-label border px-8 py-4 ${
                          m.resolved ? (m.outcome ? "border-yes/40 text-yes" : "border-no/40 text-no") : closed ? "border-line text-muted" : "border-accent/50 text-accent"
                        }`}
                      >
                        {m.resolved ? (m.outcome ? "Resolved yes" : "Resolved no") : now ? countdown(m.resolutionTime, now) : "—"}
                      </span>
                    </div>
                    <p className="text-20 leading-tight font-bold text-ink sm:text-24">{m.question}</p>
                    <div className="mt-auto flex flex-col gap-10">
                      <div className="flex h-32 w-full overflow-hidden border border-line">
                        <span className="flex items-center justify-start bg-yes pl-8" style={{ width: `${odds.yes}%` }}>
                          <span className="hn-num text-11 text-bg">{odds.yes >= 18 ? `${odds.yes.toFixed(0)}%` : ""}</span>
                        </span>
                        <span className="flex items-center justify-end bg-no pr-8" style={{ width: `${odds.no}%` }}>
                          <span className="hn-num text-11 text-bg">{odds.no >= 18 ? `${odds.no.toFixed(0)}%` : ""}</span>
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="hn-poster text-24 text-yes">Yes {odds.yes.toFixed(0)}</span>
                        <span className="hn-poster text-24 text-no">No {odds.no.toFixed(0)}</span>
                      </div>
                      <Label>Pool {fmtUsdg(m.yesPool + m.noPool)} USDG</Label>
                    </div>
                  </CardBody>
                </Link>
              </Card>
            );
          })}
        </ul>
      )}
    </>
  );
}
