import { formatUnits, parseUnits } from "viem";
import { USDG_DECIMALS } from "@/config/contracts";

const num = (v: number, digits: number) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 6-decimal USDG amount -> "1,234.56". Undefined reads as zero. */
export function fmtUsdg(v: bigint | undefined, digits = 2): string {
  return v === undefined ? num(0, digits) : num(Number(formatUnits(v, USDG_DECIMALS)), digits);
}

/** Signed USDG with an explicit sign: "+12.00" / "-3.50". */
export function fmtSignedUsdg(v: bigint | undefined, digits = 2): string {
  if (v === undefined) return num(0, digits);
  return (v < 0n ? "-" : "+") + fmtUsdg(v < 0n ? -v : v, digits);
}

/** 8-decimal oracle price -> "335.38". */
export function fmtPrice(v: bigint | undefined, digits = 2): string {
  return v === undefined ? num(0, digits) : num(Number(formatUnits(v, 8)), digits);
}

/** Text input -> 6-decimal USDG amount, 0 when it does not parse. */
export function toUsdg(text: string): bigint {
  const t = text.trim();
  if (!t || Number.isNaN(Number(t))) return 0n;
  try {
    return parseUnits(t, USDG_DECIMALS);
  } catch {
    return 0n;
  }
}

/** A 1e18-scaled hourly funding rate -> "+0.0123%". */
export function fmtFunding(rate: bigint | undefined): string {
  if (rate === undefined) return "0.0000%";
  const pct = (Number(rate) / 1e18) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(4) + "%";
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function isAddress(a: string): a is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** The pools are the odds: yes% and no% of the total, 50/50 when empty. */
export function impliedOdds(yesPool: bigint, noPool: bigint): { yes: number; no: number } {
  const total = yesPool + noPool;
  if (total === 0n) return { yes: 50, no: 50 };
  const yes = Number((10_000n * yesPool) / total) / 100;
  return { yes, no: 100 - yes };
}

/** "3d 4h", "2h 15m", "40m" or "Closed". */
export function countdown(resolutionTime: bigint | number, now = Date.now()): string {
  const ms = Number(resolutionTime) * 1000 - now;
  if (ms <= 0) return "Closed";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** Parimutuel payout for a stake joining `mySide` against `otherSide`, after the 2% fee on the losing pool. */
export function estimatePayout(stake: bigint, mySide: bigint, otherSide: bigint, feeBps = 200n): bigint {
  if (stake === 0n) return 0n;
  const winning = mySide + stake;
  return stake + (((10_000n - feeBps) * otherSide) / 10_000n) * stake / winning;
}
