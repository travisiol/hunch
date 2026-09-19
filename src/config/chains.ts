import { defineChain } from "viem";

/**
 * Robinhood Chain — an Arbitrum Orbit chain, id 4663, ~0.1 s blocks, ETH for gas.
 * Every value can be overridden from the environment; defaults are the public endpoints.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL?.trim() || "https://rpc.mainnet.chain.robinhood.com";

export const RPC_FALLBACKS: string[] = (process.env.NEXT_PUBLIC_RPC_FALLBACKS ?? "https://robinhood-rpc.publicnode.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** The browser talks to the chain through our own relay (see app/api/rpc); Node scripts and the server go direct. */
export const BROWSER_RPC_URL = "/api/rpc";
export const isBrowser = () => typeof window !== "undefined";

export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() || "https://robinhoodchain.blockscout.com").replace(/\/$/, "");

/** Multicall3 at its canonical address (present on chain 4663; on a bare local node set NEXT_PUBLIC_MULTICALL3=). */
export const MULTICALL3 = (process.env.NEXT_PUBLIC_MULTICALL3 ?? "0xcA11bde05977b3631167028862bE2a173976CA11") as `0x${string}` | "";

export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME?.trim() || (CHAIN_ID === 4663 ? "Robinhood Chain" : `Chain ${CHAIN_ID}`);

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL, ...RPC_FALLBACKS] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER_URL } },
  ...(MULTICALL3 ? { contracts: { multicall3: { address: MULTICALL3 } } } : {}),
  testnet: CHAIN_ID !== 4663,
});

export const explorer = {
  address: (a: string) => `${EXPLORER_URL}/address/${a}`,
  token: (a: string) => `${EXPLORER_URL}/token/${a}`,
  tx: (h: string) => `${EXPLORER_URL}/tx/${h}`,
};
