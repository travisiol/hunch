"use client";

import { useState } from "react";
import { maxUint256 } from "viem";
import { Button, Card, CardBody, CardHeader, Field, Label, PageHeading, Stat } from "@/components/ui";
import { brand } from "@/config/brand";
import { explorer } from "@/config/chains";
import { CONTRACTS, IS_REFERENCE_DEPLOYMENT, REFERENCE_DEPLOYMENT, USDG } from "@/config/contracts";
import { erc20Abi } from "@/lib/abi/erc20";
import { vaultAbi } from "@/lib/abi/vault";
import { fmtUsdg, toUsdg } from "@/lib/format";
import { useAddress, useTx, useUsdgWallet, useVaultBalance, ZERO } from "@/lib/hooks";

export function Deposit() {
  const address = useAddress();
  const { free, locked } = useVaultBalance();
  const { balance, allowance } = useUsdgWallet();
  const [depositText, setDepositText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");
  const tx = useTx();
  const vault = (CONTRACTS.vault || ZERO) as `0x${string}`;

  const depositAmount = toUsdg(depositText);
  const withdrawAmount = toUsdg(withdrawText);
  const needsApproval = depositAmount > allowance;
  const busy = tx.busy;

  return (
    <>
      <PageHeading title="Deposit" sub="Fund your account with USDG. One balance powers both markets. Your keys never leave your device and withdrawals are open at any time." />
      <div className="grid gap-20 lg:grid-cols-[380px_380px]">
        <Card className="h-fit">
          <CardHeader>
            <Label>Balances</Label>
          </CardHeader>
          <CardBody className="flex flex-col gap-20">
            <Stat label="Wallet USDG" value={fmtUsdg(balance)} />
            <Stat label="Vault free" value={fmtUsdg(free)} tone="up" />
            <Stat label="Vault in play" value={fmtUsdg(locked)} sub="Committed to open bets and positions" />
            <p className="text-12 leading-relaxed text-muted">
              Vault{" "}
              <a href={explorer.address(vault)} target="_blank" rel="noreferrer" className="hn-num text-ink hover:text-accent">
                {vault.slice(0, 10)}…
              </a>
              {IS_REFERENCE_DEPLOYMENT ? (
                <>
                  {" "}
                  — the reference deployment ({REFERENCE_DEPLOYMENT.name}), same interface, until {brand.name}&apos;s own contracts are live. Read the{" "}
                  <a href="/docs#contracts" className="text-ink underline hover:text-accent">
                    contracts note
                  </a>
                  .
                </>
              ) : null}
            </p>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-20">
          <Card>
            <CardHeader>
              <Label>Deposit</Label>
            </CardHeader>
            <CardBody className="flex flex-col gap-20">
              <Field label="Amount" suffix="USDG" inputMode="decimal" placeholder="0.00" value={depositText} onChange={(e) => setDepositText(e.target.value)} />
              <button type="button" onClick={() => setDepositText(String(Number(balance) / 1e6))} className="hn-label self-start hover:text-ink">
                Max {fmtUsdg(balance)}
              </button>
              {needsApproval ? (
                <Button disabled={!address || depositAmount === 0n || busy} onClick={() => tx.send({ address: USDG, abi: erc20Abi, functionName: "approve", args: [vault, maxUint256] })}>
                  {busy ? "Approving" : "Approve USDG"}
                </Button>
              ) : (
                <Button disabled={!address || depositAmount === 0n || depositAmount > balance || busy} onClick={() => tx.send({ address: vault, abi: vaultAbi, functionName: "deposit", args: [depositAmount] })}>
                  {busy ? "Depositing" : "Deposit"}
                </Button>
              )}
              {depositAmount > balance ? <Label>Not enough USDG in the wallet</Label> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Label>Withdraw</Label>
            </CardHeader>
            <CardBody className="flex flex-col gap-20">
              <Field label="Amount" suffix="USDG" inputMode="decimal" placeholder="0.00" value={withdrawText} onChange={(e) => setWithdrawText(e.target.value)} />
              <button type="button" onClick={() => setWithdrawText(String(Number(free) / 1e6))} className="hn-label self-start hover:text-ink">
                Max {fmtUsdg(free)}
              </button>
              <Button disabled={!address || withdrawAmount === 0n || withdrawAmount > free || busy} onClick={() => tx.send({ address: vault, abi: vaultAbi, functionName: "withdraw", args: [withdrawAmount] })}>
                {busy ? "Withdrawing" : "Withdraw"}
              </Button>
              {locked > 0n ? <Label>{fmtUsdg(locked)} USDG is committed to open positions and cannot be withdrawn yet.</Label> : null}
            </CardBody>
          </Card>
        </div>
      </div>
      {!address ? <Label className="mt-20 block">Connect a wallet to deposit</Label> : null}
      {tx.error ? <Label className="mt-20 block text-no">{tx.error}</Label> : null}
      {tx.phase === "done" ? <Label className="mt-20 block text-yes">Confirmed onchain</Label> : null}
    </>
  );
}
