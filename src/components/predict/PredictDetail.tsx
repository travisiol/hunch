"use client";

import Link from "next/link";
import { useState } from "react";
import { useReadContracts } from "wagmi";
import type { Market } from "@/components/predict/PredictList";
import { Button, Card, CardBody, CardHeader, Field, Label, Stat } from "@/components/ui";
import { CONTRACTS } from "@/config/contracts";
import { predictionMarketAbi } from "@/lib/abi/predictionMarket";
import { countdown, estimatePayout, fmtUsdg, impliedOdds, toUsdg } from "@/lib/format";
import { useAddress, useNow, useTx, useVaultBalance, ZERO } from "@/lib/hooks";

export function PredictDetail({ id }: { id: bigint }) {
  const address = useAddress();
  const now = useNow();
  const { free } = useVaultBalance();
  const [side, setSide] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const pm = (CONTRACTS.predictionMarket || ZERO) as `0x${string}`;

  const { data } = useReadContracts({
    contracts: [
      { address: pm, abi: predictionMarketAbi, functionName: "getMarket", args: [id] },
      { address: pm, abi: predictionMarketAbi, functionName: "yesStake", args: [id, address ?? ZERO] },
      { address: pm, abi: predictionMarketAbi, functionName: "noStake", args: [id, address ?? ZERO] },
      { address: pm, abi: predictionMarketAbi, functionName: "previewPayout", args: [id, address ?? ZERO] },
      { address: pm, abi: predictionMarketAbi, functionName: "claimed", args: [id, address ?? ZERO] },
    ],
    query: { enabled: Boolean(CONTRACTS.predictionMarket), refetchInterval: 12_000 },
  });
  const market = data?.[0]?.result as Market | undefined;
  const yes = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const no = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const payout = (data?.[3]?.result as bigint | undefined) ?? 0n;
  const claimed = Boolean(data?.[4]?.result);

  if (!market) {
    return data && data[0]?.status === "failure" ? (
      <>
        <Link href="/app/predict" className="hn-label mb-20 inline-block hover:text-ink">
          Back to predictions
        </Link>
        <Label className="block">No market with id {id.toString()}</Label>
      </>
    ) : (
      <Label>Loading market</Label>
    );
  }

  const odds = impliedOdds(market.yesPool, market.noPool);
  const stake = toUsdg(amount);
  const closed = market.resolved || (now > 0 && Number(market.resolutionTime) * 1000 <= now);
  const mine = side ? market.yesPool : market.noPool;
  const other = side ? market.noPool : market.yesPool;
  const estimate = side === null ? 0n : estimatePayout(stake, mine, other);
  const canBet = Boolean(address) && !closed && side !== null && stake > 0n && stake <= free;
  const manual = market.priceFeed === ZERO;

  return (
    <>
      <Link href="/app/predict" className="hn-label mb-20 inline-block hover:text-ink">
        Back to predictions
      </Link>
      <div className="grid gap-20 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-20">
          <Card>
            <CardBody className="flex flex-col gap-24">
              <div className="flex items-center justify-between">
                <Label>Market {market.id.toString()}</Label>
                <Label>{market.resolved ? (market.outcome ? "Resolved YES" : "Resolved NO") : now ? `Closes in ${countdown(market.resolutionTime, now)}` : ""}</Label>
              </div>
              <h1 className="text-24 leading-tight font-bold text-ink sm:text-32">{market.question}</h1>
              <div className="flex flex-col gap-10">
                <div className="flex h-10 w-full overflow-hidden border border-line">
                  <span className="bg-yes" style={{ width: `${odds.yes}%` }} />
                  <span className="bg-no" style={{ width: `${odds.no}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="hn-num text-16 text-yes">YES {odds.yes.toFixed(1)}%</span>
                  <span className="hn-num text-16 text-no">NO {odds.no.toFixed(1)}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-20 sm:grid-cols-4">
                <Stat label="YES pool" value={fmtUsdg(market.yesPool)} />
                <Stat label="NO pool" value={fmtUsdg(market.noPool)} />
                <Stat label="Total pool" value={fmtUsdg(market.yesPool + market.noPool)} />
                <Stat label="Resolution" value={new Date(Number(market.resolutionTime) * 1000).toLocaleDateString("en-US")} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Label>Settlement</Label>
            </CardHeader>
            <CardBody className="flex flex-col gap-12 text-14 leading-relaxed text-muted">
              {manual ? (
                <p>Resolved by the market admin after the resolution time. There is no feed for this question.</p>
              ) : (
                <p>
                  Resolves from a Chainlink feed. YES if the price is {market.comparator === 0 ? "above" : "below"}{" "}
                  <span className="hn-num text-ink">{(Number(market.targetPrice) / 1e8).toLocaleString("en-US")}</span> at the resolution time. Anyone can trigger the
                  resolution once that time passes.
                </p>
              )}
              <p>A 2% protocol fee is taken from the losing pool only. If one side is empty, everyone is refunded and no fee is charged.</p>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-[92px]">
          <CardHeader>
            <Label>{market.resolved ? "Your position" : "Take a side"}</Label>
          </CardHeader>
          <CardBody className="flex flex-col gap-20">
            {yes > 0n || no > 0n ? (
              <div className="grid grid-cols-2 gap-16 border border-line px-16 py-14">
                <Stat label="Your YES" value={fmtUsdg(yes)} />
                <Stat label="Your NO" value={fmtUsdg(no)} />
              </div>
            ) : null}

            {market.resolved ? (
              <>
                <Stat label="Claimable" value={`${fmtUsdg(payout)} USDG`} tone={payout > 0n ? "up" : "default"} />
                <Button
                  disabled={payout === 0n || claimed || tx.busy}
                  onClick={() => tx.send({ address: pm, abi: predictionMarketAbi, functionName: "claim", args: [id] })}
                >
                  {claimed ? "Already claimed" : tx.phase === "wallet" ? "Confirm in wallet" : tx.phase === "pending" ? "Confirming" : "Claim payout"}
                </Button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-12">
                  <Button tone="yes" active={side === true} onClick={() => setSide(true)}>
                    YES
                  </Button>
                  <Button tone="no" active={side === false} onClick={() => setSide(false)}>
                    NO
                  </Button>
                </div>
                <Field label="Amount" suffix="USDG" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <div className="flex items-center justify-between gap-12">
                  <Label>Vault free</Label>
                  <button type="button" onClick={() => setAmount(String(Number(free) / 1e6))} className="hn-num text-14 text-ink hover:text-accent">
                    {fmtUsdg(free)} USDG
                  </button>
                </div>
                {side !== null && stake > 0n ? (
                  <div className="flex flex-col gap-8 border border-line px-16 py-14">
                    <Stat label="Payout if right" value={`${fmtUsdg(estimate)} USDG`} tone="up" />
                    <Label>Estimated at the current pool. Later bets move it.</Label>
                  </div>
                ) : null}
                {stake > free ? <Label>Not enough free vault balance</Label> : null}
                {closed ? <Label>Betting is closed. Waiting for resolution.</Label> : null}
                <Button
                  disabled={!canBet || tx.busy}
                  onClick={() => side !== null && tx.send({ address: pm, abi: predictionMarketAbi, functionName: "bet", args: [id, side, stake] })}
                >
                  {tx.phase === "wallet" ? "Confirm in wallet" : tx.phase === "pending" ? "Placing bet" : "Place bet"}
                </Button>
                {!address ? <Label>Connect a wallet to bet</Label> : null}
              </>
            )}
            {tx.error ? <Label className="text-no">{tx.error}</Label> : null}
            {tx.phase === "done" ? <Label className="text-yes">Confirmed onchain</Label> : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
