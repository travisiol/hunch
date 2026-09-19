"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { Card, Empty, Label, PageHeading } from "@/components/ui";
import { CATEGORY_LABEL, PERP_MARKETS, type AssetCategory } from "@/config/assets";
import { CONTRACTS } from "@/config/contracts";
import { perpEngineAbi } from "@/lib/abi/perpEngine";
import { fmtFunding, fmtPrice, fmtUsdg } from "@/lib/format";
import { ZERO } from "@/lib/hooks";

export type PerpMarket = {
  priceFeed: `0x${string}`;
  maxLeverage: bigint;
  maintenanceMargin: bigint;
  cumulativeFunding: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  lastFundingTime: bigint;
  exists: boolean;
};

const FILTERS: ("all" | AssetCategory)[] = ["all", "stock", "etf", "crypto", "private"];

/** Market, mark price and funding of every perp, in one multicall; refreshed every 10 s. */
export function usePerpMarkets() {
  const engine = (CONTRACTS.perpEngine || ZERO) as `0x${string}`;
  const { data, isLoading } = useReadContracts({
    contracts: PERP_MARKETS.flatMap((_, i) => [
      { address: engine, abi: perpEngineAbi, functionName: "getMarket" as const, args: [i] as const },
      { address: engine, abi: perpEngineAbi, functionName: "markPrice" as const, args: [i] as const },
      { address: engine, abi: perpEngineAbi, functionName: "currentFundingRate" as const, args: [i] as const },
    ]),
    query: { enabled: Boolean(CONTRACTS.perpEngine), refetchInterval: 10_000 },
  });
  const rows = useMemo(
    () =>
      PERP_MARKETS.map((asset, i) => ({
        asset,
        index: i,
        market: data?.[3 * i]?.result as PerpMarket | undefined,
        price: data?.[3 * i + 1]?.result as bigint | undefined,
        funding: data?.[3 * i + 2]?.result as bigint | undefined,
      })),
    [data],
  );
  return { rows, isLoading: isLoading || !data };
}

function FundingTag({ rate, className = "" }: { rate: bigint | undefined; className?: string }) {
  const tone = rate && rate > 0n ? "border-short/40 text-short" : rate && rate < 0n ? "border-long/40 text-long" : "border-line text-muted";
  return <span className={`hn-num inline-block border px-10 py-4 text-12 ${tone} ${className}`}>{fmtFunding(rate)}</span>;
}

export function PerpsList() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const { rows, isLoading } = usePerpMarkets();
  const shown = useMemo(() => rows.filter((r) => filter === "all" || r.asset.category === filter), [rows, filter]);
  const openInterest = useMemo(() => shown.reduce((acc, r) => acc + (r.market?.longOpenInterest ?? 0n) + (r.market?.shortOpenInterest ?? 0n), 0n), [shown]);

  return (
    <>
      <PageHeading title="Perpetuals" sub="Perpetual futures on every Robinhood Chain asset. Up to 20x leverage, funding every hour, positions that never expire." />
      <div className="mb-24 flex flex-wrap items-center justify-between gap-16">
        <div className="flex max-w-full overflow-x-auto border border-line-strong bg-panel">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`hn-label shrink-0 px-18 py-12 whitespace-nowrap transition-colors md:py-10 ${filter === f ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {f === "all" ? "All" : CATEGORY_LABEL[f]}
            </button>
          ))}
        </div>
        <span className="hn-label">
          {shown.length} markets · open interest <span className="hn-num text-ink">{fmtUsdg(openInterest)} USDG</span>
        </span>
      </div>

      {!CONTRACTS.perpEngine ? (
        <Empty>Set NEXT_PUBLIC_PERP_ENGINE_ADDRESS to load perp markets</Empty>
      ) : isLoading ? (
        <Empty>Loading markets</Empty>
      ) : shown.length === 0 ? (
        <Empty>No markets in this view</Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-12 md:hidden">
            {shown.map(({ asset, market, price, funding }) => (
              <Card as="li" key={asset.symbol}>
                <Link href={`/app/perps/${asset.symbol}`} className="flex flex-col gap-14 px-16 py-16">
                  <div className="flex items-start justify-between gap-12">
                    <div className="flex min-w-0 flex-col gap-4">
                      <span className="hn-poster text-24 text-ink">{asset.symbol}</span>
                      <span className="hn-label truncate">{asset.name}</span>
                    </div>
                    <span className="hn-num text-24 leading-none text-ink">{fmtPrice(price)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-8 border-t border-line pt-12">
                    <div className="flex flex-col gap-4">
                      <Label>Funding</Label>
                      <FundingTag rate={funding} className="w-fit" />
                    </div>
                    <div className="flex flex-col gap-4">
                      <Label>Open int.</Label>
                      <span className="hn-num text-12 text-ink">{fmtUsdg((market?.longOpenInterest ?? 0n) + (market?.shortOpenInterest ?? 0n))}</span>
                    </div>
                    <div className="flex flex-col items-end gap-4">
                      <Label>{market ? `${market.maxLeverage.toString()}x` : "20x"}</Label>
                      <span className="hn-label text-accent">Trade ↗</span>
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </ul>

          <Card className="scroll-x hidden md:block">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-panel-2">
                  {["Market", "Mark price", "Funding / 1h", "Long OI", "Short OI", "Leverage", ""].map((h) => (
                    <th key={h} className="hn-label px-20 py-14 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ asset, market, price, funding }) => (
                  <tr key={asset.symbol} className="group border-b border-line transition-colors last:border-b-0 hover:bg-accent">
                    <td className="px-20 py-16">
                      <Link href={`/app/perps/${asset.symbol}`} className="flex flex-col gap-4">
                        <span className="hn-poster text-24 text-ink group-hover:text-accent-ink">{asset.symbol}</span>
                        <span className="hn-label group-hover:text-accent-ink/70">{asset.name}</span>
                      </Link>
                    </td>
                    <td className="hn-num px-20 py-16 text-24 text-ink group-hover:text-accent-ink">{fmtPrice(price)}</td>
                    <td className="px-20 py-16">
                      <FundingTag rate={funding} className="group-hover:border-accent-ink/40 group-hover:text-accent-ink" />
                    </td>
                    <td className="hn-num px-20 py-16 text-muted group-hover:text-accent-ink/70">{fmtUsdg(market?.longOpenInterest)}</td>
                    <td className="hn-num px-20 py-16 text-muted group-hover:text-accent-ink/70">{fmtUsdg(market?.shortOpenInterest)}</td>
                    <td className="hn-num px-20 py-16 text-muted group-hover:text-accent-ink/70">{market ? `${market.maxLeverage.toString()}x` : "20x"}</td>
                    <td className="px-20 py-16 text-right">
                      <Link href={`/app/perps/${asset.symbol}`} className="hn-label text-accent group-hover:text-accent-ink">
                        Trade ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <p className="hn-label mt-20">Positive funding means longs pay shorts. Funding is capped at 0.05% per hour.</p>
    </>
  );
}
