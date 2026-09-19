/**
 * The three HUNCH contracts and the collateral token.
 *
 * Until HUNCH's own contracts are deployed (`cd contracts && npm run
 * deploy:robinhood`), the site runs against the reference deployment: the
 * OSSO Markets contracts on Robinhood Chain, whose interface is identical.
 * The docs and the deposit page say so whenever that is the case. Set the
 * NEXT_PUBLIC_*_ADDRESS variables to point the site at your own.
 */
const addr = (v: string | undefined, fallback: `0x${string}` | ""): `0x${string}` | "" => {
  const s = v?.trim() ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? (s as `0x${string}`) : fallback;
};

export const REFERENCE_DEPLOYMENT = {
  name: "OSSO Markets",
  vault: "0xE0F0546bb1e7A20A1F8D685dCe8E37f58B4BEC20",
  predictionMarket: "0x06b5c4c3AcCd3F3230eb069e54B2d84cF08090be",
  perpEngine: "0x3557fFBcBF6F75cDAdeD5160291BcCe4eE4bef37",
} as const;

export const CONTRACTS = {
  vault: addr(process.env.NEXT_PUBLIC_VAULT_ADDRESS, REFERENCE_DEPLOYMENT.vault),
  predictionMarket: addr(process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS, REFERENCE_DEPLOYMENT.predictionMarket),
  perpEngine: addr(process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS, REFERENCE_DEPLOYMENT.perpEngine),
};

/** USDG on Robinhood Chain, 6 decimals. */
export const USDG = addr(process.env.NEXT_PUBLIC_USDG_ADDRESS, "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") as `0x${string}`;
export const USDG_DECIMALS = 6;

/** True while the site still points at the reference deployment rather than its own contracts. */
export const IS_REFERENCE_DEPLOYMENT =
  CONTRACTS.vault === REFERENCE_DEPLOYMENT.vault &&
  CONTRACTS.predictionMarket === REFERENCE_DEPLOYMENT.predictionMarket &&
  CONTRACTS.perpEngine === REFERENCE_DEPLOYMENT.perpEngine;

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
