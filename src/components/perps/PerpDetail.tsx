"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReadContracts } from "wagmi";
import type { PerpMarket } from "@/components/perps/PerpsList";
import { Button, Card, CardBody, CardHeader, Empty, Field, Label, Stat } from "@/components/ui";
import { ASSET_BY_SYMBOL, perpIndex } from "@/config/assets";
import { CONTRACTS } from "@/config/contracts";
import { perpEngineAbi } from "@/lib/abi/perpEngine";
import { fmtFunding, fmtPrice, fmtSignedUsdg, fmtUsdg, toUsdg } from "@/lib/format";
import { useAddress, useTx, useVaultBalance, ZERO } from "@/lib/hooks";

type Position = {
  trader: `0x${string}`;
  marketIndex: number;
  isLong: boolean;
  size: bigint;
  collateral: bigint;
  entryPrice: bigint;
  fundingSnapshot: bigint;
  openedAt: bigint;
};

const RANGES = [
  { key: "1H", points: 12 },
  { key: "6H", points: 30 },
  { key: "1D", points: 60 },
  { key: "ALL", points: 120 },
] as const;

const LEVERAGES = [1, 2, 5, 10, 20];

const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Candle = { t: number; p: string };

/** The oracle's own history: every point is a round the Chainlink feed actually published. */
function OracleChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1D");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = RANGES.find((r) => r.key === range)!.points;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/candles/${symbol}?points=${points}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "Failed to load prices");
        setCandles(json.candles ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, points]);

  const chart = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    const values = candles.map((c) => Number(c.p) / 1e8);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.abs(max) * 0.001 || 1;
    const W = 1000;
    const H = 260;
    const x = (i: number) => (i / (values.length - 1)) * W;
    const y = (v: number) => 24 + (1 - (v - min) / span) * 212;
    const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
    return { values, min, max, W, H, x, y, line, area: `${line} L${W} ${H} L0 ${H} Z`, first: values[0], last: values[values.length - 1] };
  }, [candles]);

  const change = chart ? ((chart.last - chart.first) / chart.first) * 100 : 0;
  const up = change >= 0;
  const color = up ? "var(--color-long)" : "var(--color-short)";

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-wrap items-baseline justify-between gap-12">
        <div className="flex items-baseline gap-12">
          <span className="hn-num text-32 text-ink">{chart ? money(hover !== null ? chart.values[hover] : chart.last) : "—"}</span>
          {chart ? (
            <span className={`hn-num text-14 ${up ? "text-long" : "text-short"}`}>
              {up ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          ) : null}
        </div>
        <div className="flex border border-line-strong">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`hn-label px-14 py-8 transition-colors ${range === r.key ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div className="relative border border-line bg-bg">
        {error ? (
          <div className="px-20 py-40 text-center">
            <Label>{error}</Label>
          </div>
        ) : chart ? (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chart.W} ${chart.H}`}
              preserveAspectRatio="none"
              className="block h-[260px] w-full"
              onMouseMove={(e) => {
                if (!svgRef.current) return;
                const rect = svgRef.current.getBoundingClientRect();
                const i = Math.round(((e.clientX - rect.left) / rect.width) * (chart.values.length - 1));
                setHover(Math.min(Math.max(i, 0), chart.values.length - 1));
              }}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id={`fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map((f) => (
                <line key={f} x1="0" x2={chart.W} y1={chart.y(chart.min + f * (chart.max - chart.min))} y2={chart.y(chart.min + f * (chart.max - chart.min))} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={chart.area} fill={`url(#fill-${symbol})`} />
              <path d={chart.line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null ? (
                <>
                  <line x1={chart.x(hover)} x2={chart.x(hover)} y1="0" y2={chart.H} stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <circle cx={chart.x(hover)} cy={chart.y(chart.values[hover])} r="4" fill={color} vectorEffect="non-scaling-stroke" />
                </>
              ) : null}
            </svg>
            <div className="pointer-events-none absolute top-10 left-14">
              <Label>{money(chart.max)}</Label>
            </div>
            <div className="pointer-events-none absolute bottom-10 left-14">
              <Label>{money(chart.min)}</Label>
            </div>
            <div className="pointer-events-none absolute right-14 bottom-10">
              <Label>{hover !== null && candles ? new Date(candles[hover].t * 1000).toLocaleString("en-US") : `${chart.values.length} oracle updates`}</Label>
            </div>
          </>
        ) : (
          <div className="px-20 py-40 text-center">
            <Label>{candles ? "Not enough price history yet" : "Loading price history"}</Label>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * TradingView's advanced chart embed, in our colours. It lives in its own
 * srcdoc iframe so the embed script never meets React's re-renders (Strict
 * Mode runs effects twice in dev, which broke the DOM-injected version).
 */
function TradingView({ tvSymbol }: { tvSymbol: string }) {
  const config = JSON.stringify({
    symbol: tvSymbol,
    interval: "D",
    timezone: "Etc/UTC",
    theme: "dark",
    style: "2",
    locale: "en",
    hide_top_toolbar: false,
    hide_legend: false,
    allow_symbol_change: false,
    save_image: false,
    backgroundColor: "#0f0e0b",
    gridColor: "rgba(255, 176, 0, 0.06)",
    withdateranges: true,
    autosize: true,
  });
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0f0e0b}.tradingview-widget-container,.tradingview-widget-container__widget{height:100%;width:100%}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>${config}</script></div></body></html>`;
  return (
    <div className="border border-line bg-bg">
      <iframe key={tvSymbol} title={`TradingView ${tvSymbol}`} srcDoc={srcDoc} className="block w-full" style={{ height: 460, border: 0 }} sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy" />
    </div>
  );
}

export function PerpDetail({ symbol }: { symbol: string }) {
  const asset = ASSET_BY_SYMBOL[symbol];
  const index = perpIndex(symbol);
  const address = useAddress();
  const { free } = useVaultBalance();
  const [chart, setChart] = useState<"tv" | "oracle">(asset?.tv ? "tv" : "oracle");
  const [isLong, setIsLong] = useState(true);
  const [collateralText, setCollateralText] = useState("");
  const [leverage, setLeverage] = useState(10);
  const tx = useTx();
  const engine = (CONTRACTS.perpEngine || ZERO) as `0x${string}`;

  const { data } = useReadContracts({
    contracts: [
      { address: engine, abi: perpEngineAbi, functionName: "getMarket", args: [index] },
      { address: engine, abi: perpEngineAbi, functionName: "markPrice", args: [index] },
      { address: engine, abi: perpEngineAbi, functionName: "currentFundingRate", args: [index] },
      { address: engine, abi: perpEngineAbi, functionName: "positionIdsOf", args: [address ?? ZERO] },
    ],
    query: { enabled: Boolean(CONTRACTS.perpEngine) && index >= 0, refetchInterval: 10_000 },
  });
  const market = data?.[0]?.result as PerpMarket | undefined;
  const mark = data?.[1]?.result as bigint | undefined;
  const funding = data?.[2]?.result as bigint | undefined;
  const ids = useMemo(() => ((data?.[3]?.result as readonly bigint[] | undefined) ?? []) as bigint[], [data]);

  const { data: posData } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: engine, abi: perpEngineAbi, functionName: "getPosition" as const, args: [id] as const },
      { address: engine, abi: perpEngineAbi, functionName: "getPnL" as const, args: [id] as const },
      { address: engine, abi: perpEngineAbi, functionName: "getLiquidationPrice" as const, args: [id] as const },
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 10_000 },
  });
  const positions = useMemo(
    () =>
      ids
        .map((id, i) => ({
          id,
          position: posData?.[3 * i]?.result as Position | undefined,
          pnl: (posData?.[3 * i + 1]?.result as bigint | undefined) ?? 0n,
          liqPrice: (posData?.[3 * i + 2]?.result as bigint | undefined) ?? 0n,
        }))
        .filter((p) => p.position && p.position.size > 0n && p.position.marketIndex === index),
    [ids, posData, index],
  );

  if (!asset || index < 0) {
    return (
      <>
        <Link href="/app/perps" className="hn-label mb-20 inline-block hover:text-ink">
          Back to perpetuals
        </Link>
        <Empty>No perpetual market for {symbol}</Empty>
      </>
    );
  }

  const collateral = toUsdg(collateralText);
  const size = collateral * BigInt(leverage);
  const canOpen = Boolean(address) && collateral > 0n && collateral <= free;
  const maintenance = market?.maintenanceMargin ?? 500n;
  // liquidation price = entry x (1 -/+ (1/leverage - maintenance)), before funding
  const estLiq =
    mark && collateral > 0n
      ? isLong
        ? mark - (mark * (10_000n / BigInt(leverage) - maintenance)) / 10_000n
        : mark + (mark * (10_000n / BigInt(leverage) - maintenance)) / 10_000n
      : 0n;

  return (
    <>
      <Link href="/app/perps" className="hn-label mb-20 inline-block hover:text-ink">
        Back to perpetuals
      </Link>
      <div className="grid gap-20 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-20">
          <Card>
            <CardBody className="flex flex-wrap items-end justify-between gap-24">
              <div className="flex flex-col gap-6">
                <Label>{asset.name}</Label>
                <h1 className="hn-poster text-32 text-ink">{symbol}-PERP</h1>
              </div>
              <div className="flex flex-wrap gap-32">
                <Stat label="Mark price" value={fmtPrice(mark)} />
                <Stat label="Funding / 1h" value={fmtFunding(funding)} tone={funding && funding > 0n ? "down" : funding && funding < 0n ? "up" : "default"} />
                <Stat label="Long OI" value={fmtUsdg(market?.longOpenInterest)} />
                <Stat label="Short OI" value={fmtUsdg(market?.shortOpenInterest)} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-12">
              <Label>{chart === "tv" ? `TradingView · ${asset.tv}` : "Chainlink oracle rounds"}</Label>
              <div className="flex border border-line-strong">
                {(["tv", "oracle"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChart(c)}
                    aria-pressed={chart === c}
                    disabled={c === "tv" && !asset.tv}
                    className={`hn-label px-14 py-8 transition-colors disabled:opacity-40 ${chart === c ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
                  >
                    {c === "tv" ? "TradingView" : "Oracle"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardBody>{chart === "tv" && asset.tv ? <TradingView tvSymbol={asset.tv} /> : <OracleChart symbol={symbol} />}</CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Label>Your positions in this market</Label>
            </CardHeader>
            <CardBody>
              {positions.length === 0 ? (
                <Empty>No open position</Empty>
              ) : (
                <ul className="flex flex-col gap-16">
                  {positions.map(({ id, position, pnl, liqPrice }) => (
                    <li key={id.toString()} className="border border-line px-16 py-16">
                      <div className="flex flex-wrap items-center gap-24">
                        <Stat label="Side" value={position!.isLong ? "LONG" : "SHORT"} tone={position!.isLong ? "up" : "down"} />
                        <Stat label="Size" value={fmtUsdg(position!.size)} />
                        <Stat label="Collateral" value={fmtUsdg(position!.collateral)} />
                        <Stat label="Entry" value={fmtPrice(position!.entryPrice)} />
                        <Stat label="Liq. price" value={fmtPrice(liqPrice)} />
                        <Stat label="Unrealized PnL" value={fmtSignedUsdg(pnl)} tone={pnl >= 0n ? "up" : "down"} />
                        <Button className="ml-auto" disabled={tx.busy} onClick={() => tx.send({ address: engine, abi: perpEngineAbi, functionName: "closePosition", args: [id] })}>
                          Close
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-[92px]">
          <CardHeader>
            <Label>Open a position</Label>
          </CardHeader>
          <CardBody className="flex flex-col gap-20">
            <div className="grid grid-cols-2 gap-12">
              <Button tone="long" active={isLong} onClick={() => setIsLong(true)}>
                Long
              </Button>
              <Button tone="short" active={!isLong} onClick={() => setIsLong(false)}>
                Short
              </Button>
            </div>
            <Field label="Collateral" suffix="USDG" inputMode="decimal" placeholder="0.00" value={collateralText} onChange={(e) => setCollateralText(e.target.value)} />
            <div className="flex flex-col gap-10">
              <Label>Leverage</Label>
              <div className="flex border border-line-strong">
                {LEVERAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLeverage(l)}
                    aria-pressed={leverage === l}
                    className={`hn-label flex-1 py-10 transition-colors ${leverage === l ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
                  >
                    {l}x
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-12">
              <Label>Vault free</Label>
              <button type="button" onClick={() => setCollateralText(String(Number(free) / 1e6))} className="hn-num text-14 text-ink hover:text-accent">
                {fmtUsdg(free)} USDG
              </button>
            </div>
            {collateral > 0n ? (
              <div className="flex flex-col gap-12 border border-line px-16 py-14">
                <Stat label="Position size" value={`${fmtUsdg(size)} USDG`} />
                <Stat label="Entry price" value={fmtPrice(mark)} />
                <Stat label="Est. liquidation" value={fmtPrice(estLiq)} tone="down" />
              </div>
            ) : null}
            {collateral > free ? <Label>Not enough free vault balance</Label> : null}
            <Button
              tone={isLong ? "long" : "short"}
              disabled={!canOpen || tx.busy}
              onClick={() => tx.send({ address: engine, abi: perpEngineAbi, functionName: "openPosition", args: [index, isLong, collateral, BigInt(leverage)] })}
            >
              {tx.phase === "wallet" ? "Confirm in wallet" : tx.phase === "pending" ? "Opening" : `${isLong ? "Long" : "Short"} ${symbol}`}
            </Button>
            {!address ? <Label>Connect a wallet to trade</Label> : null}
            {tx.error ? <Label className="text-no">{tx.error}</Label> : null}
            {tx.phase === "done" ? <Label className="text-yes">Confirmed onchain</Label> : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
