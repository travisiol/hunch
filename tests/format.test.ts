import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countdown, estimatePayout, fmtFunding, fmtPrice, fmtSignedUsdg, fmtUsdg, impliedOdds, toUsdg } from "../src/lib/format.ts";
import { ASSETS, PERP_MARKETS, perpIndex } from "../src/config/assets.ts";

describe("formatting", () => {
  it("prints USDG, prices and signs the way the contracts scale them", () => {
    assert.equal(fmtUsdg(1_234_560_000n), "1,234.56");
    assert.equal(fmtUsdg(undefined), "0.00");
    assert.equal(fmtSignedUsdg(-3_500_000n), "-3.50");
    assert.equal(fmtSignedUsdg(12_000_000n), "+12.00");
    assert.equal(fmtPrice(33_538_474_720n), "335.38");
    assert.equal(toUsdg("12.5"), 12_500_000n);
    assert.equal(toUsdg("abc"), 0n);
    assert.equal(toUsdg(""), 0n);
  });

  it("formats funding as a signed hourly percentage", () => {
    assert.equal(fmtFunding(500_000_000_000_000n), "+0.0500%");
    assert.equal(fmtFunding(-101_010_101_010_101n), "-0.0101%");
    assert.equal(fmtFunding(undefined), "0.0000%");
  });
});

describe("market math", () => {
  it("reads the odds off the pools", () => {
    assert.deepEqual(impliedOdds(0n, 0n), { yes: 50, no: 50 });
    assert.deepEqual(impliedOdds(650n, 350n), { yes: 65, no: 35 });
  });

  it("estimates the parimutuel payout after the 2% fee on the losing pool", () => {
    // 100 joins a YES pool of 300 against NO 200: 100 + 100 x (200 x 0.98) / 400 = 149
    assert.equal(estimatePayout(100_000_000n, 300_000_000n, 200_000_000n), 149_000_000n);
    assert.equal(estimatePayout(0n, 1n, 1n), 0n);
  });

  it("counts down in days, hours and minutes", () => {
    const now = 1_700_000_000_000;
    assert.equal(countdown(1_700_000_000 + 2 * 86_400 + 3 * 3600, now), "2d 3h");
    assert.equal(countdown(1_700_000_000 + 2 * 3600 + 15 * 60, now), "2h 15m");
    assert.equal(countdown(1_700_000_000 + 40 * 60, now), "40m");
    assert.equal(countdown(1_700_000_000 - 1, now), "Closed");
  });
});

describe("asset catalog", () => {
  it("has sixteen perp markets in engine order, unique symbols and checksummed feeds", () => {
    assert.equal(PERP_MARKETS.length, 16);
    assert.equal(PERP_MARKETS[0].symbol, "AAPL");
    assert.equal(PERP_MARKETS[15].symbol, "SPCX");
    assert.equal(perpIndex("BTC"), 4);
    assert.equal(perpIndex("GME"), -1);
    assert.equal(new Set(ASSETS.map((a) => a.symbol)).size, ASSETS.length);
    for (const a of ASSETS) assert.match(a.priceFeed, /^0x[0-9a-fA-F]{40}$/);
  });
});
