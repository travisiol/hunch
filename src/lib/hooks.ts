"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { Abi, ContractFunctionArgs, ContractFunctionName } from "viem";
import { useConnection, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { CHAIN_ID } from "@/config/chains";
import { CONTRACTS, USDG } from "@/config/contracts";
import { erc20Abi } from "@/lib/abi/erc20";
import { predictionMarketAbi } from "@/lib/abi/predictionMarket";
import { vaultAbi } from "@/lib/abi/vault";

export const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** True once hydrated; false during SSR and the first client render. */
export const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

/* A shared one-second clock for every countdown on the page, 0 on the server. */
let nowCached = 0;
let nowTimer: ReturnType<typeof setInterval> | undefined;
const nowListeners = new Set<() => void>();
function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  if (!nowTimer) {
    nowCached = Date.now();
    nowTimer = setInterval(() => {
      nowCached = Date.now();
      nowListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    nowListeners.delete(cb);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = undefined;
    }
  };
}
export const useNow = () =>
  useSyncExternalStore(
    subscribeNow,
    () => nowCached || (nowCached = Date.now()),
    () => 0,
  );

/** The connected wallet, or undefined. */
export function useAddress(): `0x${string}` | undefined {
  const { address } = useConnection();
  return address;
}

/** Free / in-play / total vault balance of the connected wallet. */
export function useVaultBalance() {
  const address = useAddress();
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault || ZERO, abi: vaultAbi, functionName: "freeBalanceOf", args: [address ?? ZERO] },
      { address: CONTRACTS.vault || ZERO, abi: vaultAbi, functionName: "lockedBalanceOf", args: [address ?? ZERO] },
    ],
    query: { enabled: Boolean(address && CONTRACTS.vault), refetchInterval: 12_000 },
  });
  const free = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const locked = (data?.[1]?.result as bigint | undefined) ?? 0n;
  return { free, locked, total: free + locked, refetch, isLoading };
}

/** Wallet USDG balance and its allowance to the vault. */
export function useUsdgWallet() {
  const address = useAddress();
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [address ?? ZERO] },
      { address: USDG, abi: erc20Abi, functionName: "allowance", args: [address ?? ZERO, CONTRACTS.vault || ZERO] },
    ],
    query: { enabled: Boolean(address && CONTRACTS.vault), refetchInterval: 12_000 },
  });
  return { balance: (data?.[0]?.result as bigint | undefined) ?? 0n, allowance: (data?.[1]?.result as bigint | undefined) ?? 0n, refetch };
}

export function usePredictionMarketCount() {
  return useReadContract({
    address: CONTRACTS.predictionMarket || ZERO,
    abi: predictionMarketAbi,
    functionName: "marketCount",
    query: { enabled: Boolean(CONTRACTS.predictionMarket), refetchInterval: 30_000 },
  });
}

export type TxPhase = "idle" | "wallet" | "pending" | "done" | "error";

type WriteParams<A extends Abi, F extends ContractFunctionName<A, "nonpayable" | "payable">> = {
  address: `0x${string}`;
  abi: A;
  functionName: F;
  args: ContractFunctionArgs<A, "nonpayable" | "payable", F>;
};

/**
 * One transaction at a time: ask the wallet, wait for the receipt, then
 * invalidate every contract read on the page so balances and pools refresh.
 */
export function useTx() {
  const { mutateAsync: write } = useWriteContract();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async <A extends Abi, F extends ContractFunctionName<A, "nonpayable" | "payable">>(params: WriteParams<A, F>) => {
      setError(null);
      setPhase("wallet");
      try {
        const h = await write({ ...params, chainId: CHAIN_ID } as Parameters<typeof write>[0]);
        setHash(h);
        setPhase("pending");
        const receipt = await client?.waitForTransactionReceipt({ hash: h });
        if (receipt && receipt.status !== "success") throw new Error("Transaction reverted");
        setPhase("done");
        await queryClient.invalidateQueries();
        return h;
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Transaction failed";
        setError(msg.split("\n")[0].slice(0, 160));
        setPhase("error");
        return undefined;
      }
    },
    [write, client, queryClient],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setHash(undefined);
    setError(null);
  }, []);

  return { send, reset, phase, hash, error, busy: phase === "wallet" || phase === "pending" };
}
