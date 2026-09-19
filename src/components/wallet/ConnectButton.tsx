"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN_ID, CHAIN_NAME, explorer } from "@/config/chains";
import { shortAddress } from "@/lib/format";
import { useMounted } from "@/lib/hooks";
import { ConnectDialog } from "./ConnectDialog";

/**
 * The header's wallet control. Connected: a mono address with a small menu.
 * Wrong network: a switch button. Nothing is ever signed from here.
 */
export function ConnectButton() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  const base = "hn-label border px-14 py-10 transition-colors";

  if (!mounted || !isConnected || !address) {
    return (
      <>
        <button type="button" className={`${base} border-line-strong text-ink hover:border-accent hover:text-accent`} onClick={() => setOpen(true)}>
          Connect
        </button>
        <ConnectDialog open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  if (chainId !== CHAIN_ID) {
    return (
      <button
        type="button"
        className={`${base} border-accent/60 text-accent`}
        disabled={switching}
        title={switchError ?? undefined}
        onClick={() => switchChain({ chainId: CHAIN_ID }).catch((e: Error) => setSwitchError(e.message.split("\n")[0]))}
      >
        {switching ? "Switching…" : `Switch to ${CHAIN_NAME}`}
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className={`${base} hn-num border-line-strong normal-case tracking-normal text-ink hover:border-accent`}
        onClick={() => setMenu((v) => !v)}
        aria-expanded={menu}
        aria-haspopup="menu"
      >
        <span className="mr-8 inline-block h-6 w-6 bg-long align-middle" />
        {shortAddress(address)}
      </button>
      {menu ? (
        <div role="menu" className="absolute right-0 z-40 mt-6 w-[200px] border border-line-strong bg-panel p-6 text-13">
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-10 py-8 text-left text-muted hover:bg-panel-2 hover:text-ink"
            onClick={() => {
              navigator.clipboard.writeText(address).catch(() => {});
              setMenu(false);
            }}
          >
            Copy address
          </button>
          <a role="menuitem" href={explorer.address(address)} target="_blank" rel="noreferrer" className="flex px-10 py-8 text-muted hover:bg-panel-2 hover:text-ink">
            View on explorer
          </a>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-10 py-8 text-left text-muted hover:bg-panel-2 hover:text-no"
            onClick={() => {
              disconnect();
              setMenu(false);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
