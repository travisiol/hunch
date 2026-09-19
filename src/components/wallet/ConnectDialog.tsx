"use client";

import { useEffect, useState } from "react";
import { useConnect, useConnectors } from "wagmi";
import { Mark } from "@/components/brand/Mark";
import { Label } from "@/components/ui";
import { brand } from "@/config/brand";
import { CHAIN_ID, CHAIN_NAME } from "@/config/chains";
import { hasWalletConnect } from "@/lib/wagmi";

/**
 * Our own connect sheet: every injected wallet the browser announces
 * (EIP-6963) as its own row, WalletConnect when configured.
 */
export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending, variables, error, reset } = useConnect();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const named = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const list = connectors.filter((c) => !(c.id === "injected" && named.length > 0));
  const pendingId = isPending ? (variables as { connector?: { uid?: string } } | undefined)?.connector?.uid : undefined;

  const pick = async (uid: string) => {
    const c = connectors.find((x) => x.uid === uid);
    if (!c) return;
    setFailed(null);
    try {
      await connect({ connector: c });
      onClose();
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Connection failed.";
      setFailed(msg.split("\n")[0].slice(0, 160));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-16 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
    >
      <div className="hn-frame relative w-full max-w-[420px] border border-line-strong bg-panel p-24" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="hn-label absolute top-16 right-16 p-4 hover:text-ink">
          Esc
        </button>
        <div className="flex items-center gap-10">
          <Mark size={22} className="text-ink" />
          <h2 className="hn-poster text-20 text-ink">Connect</h2>
        </div>
        <p className="mt-10 text-13 leading-relaxed text-muted">
          {CHAIN_NAME} · chain id {CHAIN_ID}. Connecting only reads your balances; {brand.name} never asks for a signature to browse.
        </p>

        <ul className="mt-20 flex flex-col gap-8">
          {list.map((c) => (
            <li key={c.uid}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => pick(c.uid)}
                className="hn-frame flex w-full items-center gap-12 border border-line bg-bg px-14 py-12 text-left transition-colors hover:border-line-strong disabled:opacity-60"
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="h-26 w-26" />
                ) : (
                  <span className="flex h-26 w-26 items-center justify-center border border-line text-muted">
                    <Mark size={14} ink="currentColor" />
                  </span>
                )}
                <span className="flex-1 text-14 font-semibold text-ink">{c.name}</span>
                <Label className="text-accent">{pendingId === c.uid ? "Waiting…" : c.type === "walletConnect" ? "QR" : "Browser"}</Label>
              </button>
            </li>
          ))}
          {list.length === 0 ? (
            <li className="border border-dashed border-line p-16 text-13 text-muted">No wallet found in this browser. Install one, or configure WalletConnect.</li>
          ) : null}
        </ul>

        {!hasWalletConnect ? <p className="mt-16 text-11 leading-relaxed text-muted">WalletConnect is off: set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to offer mobile wallets.</p> : null}
        {failed || error ? (
          <p className="mt-12 text-12 text-no" role="alert">
            {failed ?? error?.message}{" "}
            <button type="button" className="underline" onClick={() => (setFailed(null), reset())}>
              dismiss
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
