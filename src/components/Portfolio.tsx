"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Market } from "@/components/predict/PredictList";
import { Card, CardBody, CardHeader, Empty, Label, PageHeading, Stat } from "@/components/ui";
import { PERP_MARKETS } from "@/config/assets";
import { CONTRACTS } from "@/config/contracts";
import { perpEngineAbi } from "@/lib/abi/perpEngine";
import { predictionMarketAbi } from "@/lib/abi/predictionMarket";
import { fmtPrice, fmtSignedUsdg, fmtUsdg } from "@/lib/format";
import { useAddress, usePredictionMarketCount, useVaultBalance, ZERO } from "@/lib/hooks";

type Position = { trader: `0x${string}`; marketIndex: number; isLong: boolean; size: bigint; collateral: bigint; entryPrice: bigint; fundingSnapshot: bigint; openedAt: bigint };

export function Portfolio() {
  const address = useAddress();
  const { free, locked, total } = useVaultBalance();
  const { data: count } = usePredictionMarketCount();
  const n = Number(count ?? 0n);
  const pm = (CONTRACTS.predictionMarket || ZERO) as `0x${string}`;
  const engine = (CONTRACTS.perpEngine || ZERO) as `0x${string}`;

  const { data: betData } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => BigInt(i)).flatMap((id) => [
      { address: pm, abi: predictionMarketAbi, functionName: "getMarket" as const, args: [id] as const },
      { address: pm, abi: predictionMarketAbi, functionName: "yesStake" as const, args: [id, address ?? ZERO] as const },
      { address: pm, abi: predictionMarketAbi, functionName: "noStake" as const, args: [id, address ?? ZERO] as const },
      { address: pm, abi: predictionMarketAbi, functionName: "previewPayout" as const, args: [id, address ?? ZERO] as const },
      { address: pm, abi: predictionMarketAbi, functionName: "claimed" as const, args: [id, address ?? ZERO] as const },
    ]),
    query: { enabled: Boolean(address && CONTRACTS.predictionMarket) && n > 0, refetchInterval: 15_000 },
  });
  const bets = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        market: betData?.[5 * i]?.result as Market | undefined,
        yes: (betData?.[5 * i + 1]?.result as bigint | undefined) ?? 0n,
        no: (betData?.[5 * i + 2]?.result as bigint | undefined) ?? 0n,
        payout: (betData?.[5 * i + 3]?.result as bigint | undefined) ?? 0n,
        claimed: Boolean(betData?.[5 * i + 4]?.result),
      })).filter((b): b is typeof b & { market: Market } => Boolean(b.market) && (b.yes > 0n || b.no > 0n)),
    [betData, n],
  );
  const openBets = bets.filter((b) => !b.market.resolved);
  const settledBets = bets.filter((b) => b.market.resolved);

  const { data: idData } = useReadContracts({
    contracts: [{ address: engine, abi: perpEngineAbi, functionName: "positionIdsOf", args: [address ?? ZERO] }],
    query: { enabled: Boolean(address && CONTRACTS.perpEngine), refetchInterval: 15_000 },
  });
  const ids = useMemo(() => ((idData?.[0]?.result as readonly bigint[] | undefined) ?? []) as bigint[], [idData]);
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
      ids.map((id, i) => ({
        id,
        position: posData?.[3 * i]?.result as Position | undefined,
        pnl: (posData?.[3 * i + 1]?.result as bigint | undefined) ?? 0n,
        liqPrice: (posData?.[3 * i + 2]?.result as bigint | undefined) ?? 0n,
      })),
    [ids, posData],
  );
  const open = positions.filter((p) => p.position && p.position.size > 0n);
  const closed = positions.filter((p) => p.position && p.position.size === 0n);
  const openPnl = open.reduce((acc, p) => acc + p.pnl, 0n);
  const claimable = bets.reduce((acc, b) => (b.claimed ? acc : acc + b.payout), 0n);
  const inPlay = locked + openBets.reduce((acc, b) => acc + b.yes + b.no, 0n) + open.reduce((acc, p) => acc + (p.position?.collateral ?? 0n), 0n);

  if (!address) {
    return (
      <>
        <PageHeading title="Portfolio" />
        <Empty>Connect a wallet to see your positions</Empty>
      </>
    );
  }

  return (
    <>
      <PageHeading title="Portfolio" sub="Every open position across both products, and everything you have settled." />
      <div className="mb-24 grid gap-16 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody>
            <Stat label="Vault free" value={`${fmtUsdg(free)} USDG`} sub={`${fmtUsdg(total)} in the vault`} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="In play" value={`${fmtUsdg(inPlay)} USDG`} sub="Open bets and position collateral" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Open perp PnL" value={`${fmtSignedUsdg(openPnl)} USDG`} tone={openPnl >= 0n ? "up" : "down"} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Claimable" value={`${fmtUsdg(claimable)} USDG`} tone={claimable > 0n ? "up" : "default"} sub={claimable > 0n ? "Resolved bets waiting for you" : undefined} />
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-20">
        <Card>
          <CardHeader>
            <Label>Open perpetual positions</Label>
          </CardHeader>
          <CardBody>
            {open.length === 0 ? (
              <Empty>No open positions</Empty>
            ) : (
              <div className="scroll-x">
                <table className="w-full min-w-[880px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {["Market", "Side", "Size", "Collateral", "Entry", "Liq. price", "PnL"].map((h) => (
                        <th key={h} className="hn-label py-12 pr-20 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {open.map(({ id, position, pnl, liqPrice }) => {
                      const sym = PERP_MARKETS[position!.marketIndex]?.symbol ?? "?";
                      return (
                        <tr key={id.toString()} className="border-b border-line last:border-b-0">
                          <td className="py-14 pr-20">
                            <Link href={`/app/perps/${sym}`} className="text-14 text-ink hover:text-accent">
                              {sym}-PERP
                            </Link>
                          </td>
                          <td className={`hn-num py-14 pr-20 ${position!.isLong ? "text-long" : "text-short"}`}>{position!.isLong ? "LONG" : "SHORT"}</td>
                          <td className="hn-num py-14 pr-20">{fmtUsdg(position!.size)}</td>
                          <td className="hn-num py-14 pr-20">{fmtUsdg(position!.collateral)}</td>
                          <td className="hn-num py-14 pr-20">{fmtPrice(position!.entryPrice)}</td>
                          <td className="hn-num py-14 pr-20 text-short">{fmtPrice(liqPrice)}</td>
                          <td className={`hn-num py-14 pr-20 ${pnl >= 0n ? "text-long" : "text-short"}`}>{fmtSignedUsdg(pnl)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Label>Open predictions</Label>
          </CardHeader>
          <CardBody>
            {openBets.length === 0 ? (
              <Empty>No open predictions</Empty>
            ) : (
              <ul className="flex flex-col gap-12">
                {openBets.map((b) => (
                  <li key={b.market.id.toString()} className="flex flex-wrap items-center gap-24 border border-line px-16 py-14">
                    <Link href={`/app/predict/${b.market.id.toString()}`} className="max-w-[46ch] flex-1 text-14 text-ink hover:text-accent">
                      {b.market.question}
                    </Link>
                    {b.yes > 0n ? <Stat label="YES stake" value={fmtUsdg(b.yes)} tone="up" /> : null}
                    {b.no > 0n ? <Stat label="NO stake" value={fmtUsdg(b.no)} tone="down" /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Label>History</Label>
          </CardHeader>
          <CardBody>
            {settledBets.length === 0 && closed.length === 0 ? (
              <Empty>Nothing settled yet</Empty>
            ) : (
              <ul className="flex flex-col gap-12">
                {settledBets.map((b) => {
                  const won = b.payout > 0n || b.claimed;
                  return (
                    <li key={`bet-${b.market.id.toString()}`} className="flex flex-wrap items-center gap-24 border border-line px-16 py-14">
                      <Link href={`/app/predict/${b.market.id.toString()}`} className="max-w-[46ch] flex-1 text-14 text-ink hover:text-accent">
                        {b.market.question}
                      </Link>
                      <Stat label="Outcome" value={b.market.outcome ? "YES" : "NO"} />
                      <Stat label={b.claimed ? "Claimed" : won ? "Claimable" : "Result"} value={won ? (b.claimed ? "Paid" : `${fmtUsdg(b.payout)} USDG`) : "Lost"} tone={won ? "up" : "down"} />
                    </li>
                  );
                })}
                {closed.map(({ id, position }) => {
                  const sym = PERP_MARKETS[position!.marketIndex]?.symbol ?? "?";
                  return (
                    <li key={`pos-${id.toString()}`} className="flex flex-wrap items-center gap-24 border border-line px-16 py-14">
                      <span className="flex-1 text-14 text-ink">{sym}-PERP</span>
                      <Stat label="Side" value={position!.isLong ? "LONG" : "SHORT"} />
                      <Stat label="Entry" value={fmtPrice(position!.entryPrice)} />
                      <Stat label="Status" value="Closed" />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
