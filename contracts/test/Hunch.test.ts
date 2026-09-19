import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const USDG = (n: number | string) => ethers.parseUnits(String(n), 6);
const PRICE = (n: number | string) => ethers.parseUnits(String(n), 8);

async function deployAll() {
  const [owner, alice, bob, carol, fees] = await ethers.getSigners();
  const usdg = await (await ethers.getContractFactory("MockUSDG")).deploy();
  const vault = await (await ethers.getContractFactory("Vault")).deploy(await usdg.getAddress());
  const pm = await (await ethers.getContractFactory("PredictionMarket")).deploy(await vault.getAddress(), fees.address);
  const engine = await (await ethers.getContractFactory("PerpEngine")).deploy(await vault.getAddress());
  await vault.setMarket(await pm.getAddress(), true);
  await vault.setMarket(await engine.getAddress(), true);
  const feed = await (await ethers.getContractFactory("MockAggregator")).deploy("AAPL / USD", 8, PRICE(200));
  for (const who of [owner, alice, bob, carol]) {
    await usdg.mint(who.address, USDG(10_000));
    await usdg.connect(who).approve(await vault.getAddress(), ethers.MaxUint256);
    await vault.connect(who).deposit(USDG(1_000));
  }
  return { owner, alice, bob, carol, fees, usdg, vault, pm, engine, feed };
}

describe("Vault", () => {
  it("deposits, withdraws, and refuses what it does not hold", async () => {
    const { alice, vault, usdg } = await deployAll();
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(1_000));
    await vault.connect(alice).withdraw(USDG(400));
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(600));
    expect(await usdg.balanceOf(alice.address)).to.equal(USDG(9_400));
    await expect(vault.connect(alice).withdraw(USDG(601))).to.be.revertedWithCustomError(vault, "InsufficientFree");
    await expect(vault.connect(alice).withdraw(0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("only lets flagged markets move collateral", async () => {
    const { alice, bob, vault } = await deployAll();
    await expect(vault.connect(bob).lockCollateral(alice.address, 1)).to.be.revertedWithCustomError(vault, "NotMarket");
    await expect(vault.connect(bob).payout(bob.address, 1)).to.be.revertedWithCustomError(vault, "NotMarket");
    await expect(vault.connect(alice).setMarket(bob.address, true)).to.be.revertedWithCustomError(vault, "NotOwner");
  });

  it("a market can only pay out of its own balance", async () => {
    const { alice, fees, vault } = await deployAll();
    await vault.setMarket(fees.address, true); // an empty account plays a market here
    const market = vault.connect(fees);
    await expect(market.payout(alice.address, USDG(1))).to.be.revertedWithCustomError(vault, "InsufficientFree");
    await market.lockCollateral(alice.address, USDG(10));
    expect(await vault.lockedBalanceOf(alice.address)).to.equal(USDG(10));
    expect(await vault.balanceOf(alice.address)).to.equal(USDG(1_000));
    await market.settle(alice.address, fees.address, USDG(10));
    await market.payout(alice.address, USDG(4));
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(994));
    expect(await vault.freeBalanceOf(fees.address)).to.equal(USDG(6));
    await expect(market.payout(alice.address, USDG(7))).to.be.revertedWithCustomError(vault, "InsufficientFree");
    await expect(market.releaseCollateral(alice.address, 1)).to.be.revertedWithCustomError(vault, "InsufficientLocked");
  });
});

describe("PredictionMarket", () => {
  it("creates a market and takes bets from vault balances", async () => {
    const { alice, bob, vault, pm, feed } = await deployAll();
    const close = (await time.latest()) + 3600;
    await pm.createMarket("Will AAPL close above $210?", await feed.getAddress(), PRICE(210), 0, close);
    expect(await pm.marketCount()).to.equal(1n);
    await pm.connect(alice).bet(0, true, USDG(100));
    await pm.connect(bob).bet(0, false, USDG(300));
    const m = await pm.getMarket(0);
    expect(m.yesPool).to.equal(USDG(100));
    expect(m.noPool).to.equal(USDG(300));
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(900));
    expect(await vault.lockedBalanceOf(alice.address)).to.equal(0n);
    expect(await vault.freeBalanceOf(await pm.getAddress())).to.equal(USDG(400));
    expect(await pm.previewPayout(0, alice.address)).to.equal(0n); // nothing until it resolves
    await expect(pm.connect(alice).bet(0, true, USDG(2_000))).to.be.revertedWithCustomError(vault, "InsufficientFree");
    await expect(pm.connect(alice).bet(7, true, 1)).to.be.revertedWithCustomError(pm, "UnknownMarket");
    await expect(pm.connect(alice).createMarket("x", ethers.ZeroAddress, 0, 0, close)).to.be.revertedWithCustomError(pm, "NotOwner");
    await expect(pm.createMarket("x", ethers.ZeroAddress, 0, 2, close)).to.be.revertedWithCustomError(pm, "BadComparator");
  });

  it("resolves from the feed, takes 2% of the losing pool only, pays winners pro rata", async () => {
    const { alice, bob, carol, fees, vault, pm, feed } = await deployAll();
    const close = (await time.latest()) + 3600;
    await pm.createMarket("Will AAPL close above $210?", await feed.getAddress(), PRICE(210), 0, close);
    await pm.connect(alice).bet(0, true, USDG(100));
    await pm.connect(carol).bet(0, true, USDG(300));
    await pm.connect(bob).bet(0, false, USDG(200));
    await expect(pm.resolveMarket(0)).to.be.revertedWithCustomError(pm, "TooEarly");
    await time.increaseTo(close);
    await expect(pm.connect(bob).bet(0, false, USDG(1))).to.be.revertedWithCustomError(pm, "BettingClosed");
    await feed.setAnswer(PRICE(215));
    await pm.resolveMarket(0);
    const m = await pm.getMarket(0);
    expect(m.resolved).to.equal(true);
    expect(m.outcome).to.equal(true);
    // fee: 2% of the losing 200 = 4 USDG, straight to the fee recipient
    expect(await vault.freeBalanceOf(fees.address)).to.equal(USDG(4));
    // winners split 196: alice 100/400 -> 49, carol 300/400 -> 147
    expect(await pm.previewPayout(0, alice.address)).to.equal(USDG(149));
    expect(await pm.previewPayout(0, carol.address)).to.equal(USDG(447));
    expect(await pm.previewPayout(0, bob.address)).to.equal(0n);
    await pm.connect(alice).claim(0);
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(1_049));
    await expect(pm.connect(alice).claim(0)).to.be.revertedWithCustomError(pm, "AlreadyClaimed");
    await expect(pm.connect(bob).claim(0)).to.be.revertedWithCustomError(pm, "NothingToClaim");
    await pm.connect(carol).claim(0);
    expect(await vault.freeBalanceOf(await pm.getAddress())).to.equal(0n); // the pool is empty, nothing was minted
    await expect(pm.resolveMarket(0)).to.be.revertedWithCustomError(pm, "AlreadyResolved");
  });

  it("resolves BELOW markets and refuses stale prints", async () => {
    const { alice, bob, pm, feed } = await deployAll();
    const close = (await time.latest()) + 3600;
    await pm.createMarket("Will AAPL fall below $190?", await feed.getAddress(), PRICE(190), 1, close);
    await pm.connect(alice).bet(0, true, USDG(50));
    await pm.connect(bob).bet(0, false, USDG(50));
    await time.increaseTo(close);
    await feed.setUpdatedAt(close - 6 * 24 * 3600);
    await expect(pm.resolveMarket(0)).to.be.revertedWithCustomError(pm, "StalePrice");
    await feed.setAnswer(PRICE(185));
    await pm.resolveMarket(0);
    expect((await pm.getMarket(0)).outcome).to.equal(true);
  });

  it("refunds everyone, fee-free, when one side is empty", async () => {
    const { alice, carol, fees, vault, pm, feed } = await deployAll();
    const close = (await time.latest()) + 3600;
    await pm.createMarket("Will AAPL close above $210?", await feed.getAddress(), PRICE(210), 0, close);
    await pm.connect(alice).bet(0, true, USDG(100));
    await pm.connect(carol).bet(0, true, USDG(25));
    await time.increaseTo(close);
    await pm.resolveMarket(0); // 200 < 210 -> NO wins, but nobody is on NO
    expect(await vault.freeBalanceOf(fees.address)).to.equal(0n);
    expect(await pm.previewPayout(0, alice.address)).to.equal(USDG(100));
    await pm.connect(carol).claim(0);
    expect(await vault.freeBalanceOf(carol.address)).to.equal(USDG(1_000));
  });

  it("manual markets are the owner's call, after the deadline", async () => {
    const { alice, bob, pm, feed } = await deployAll();
    const close = (await time.latest()) + 3600;
    await pm.createMarket("Will SpaceX announce an IPO date?", ethers.ZeroAddress, 0, 0, close);
    await pm.connect(alice).bet(0, true, USDG(10));
    await pm.connect(bob).bet(0, false, USDG(10));
    await expect(pm.resolveMarket(0)).to.be.revertedWithCustomError(pm, "NoFeed");
    await expect(pm.resolveManual(0, true)).to.be.revertedWithCustomError(pm, "TooEarly");
    await time.increaseTo(close);
    await expect(pm.connect(alice).resolveManual(0, true)).to.be.revertedWithCustomError(pm, "NotOwner");
    await pm.resolveManual(0, false);
    expect(await pm.previewPayout(0, bob.address)).to.equal(USDG("19.8"));
    await pm.createMarket("feed market", await feed.getAddress(), PRICE(1), 0, close + 3600);
    await time.increaseTo(close + 3600);
    await expect(pm.resolveManual(1, true)).to.be.revertedWithCustomError(pm, "HasFeed");
  });
});

describe("PerpEngine", () => {
  async function withMarket() {
    const ctx = await deployAll();
    await ctx.engine.addMarket(await ctx.feed.getAddress());
    await ctx.engine.fund(USDG(500)); // the owner seeds the engine
    return ctx;
  }

  it("opens at the oracle price, sizes by leverage, books collateral", async () => {
    const { alice, vault, engine } = await withMarket();
    await engine.connect(alice).openPosition(0, true, USDG(100), 10);
    const p = await engine.getPosition(0);
    expect(p.trader).to.equal(alice.address);
    expect(p.size).to.equal(USDG(1_000));
    expect(p.entryPrice).to.equal(PRICE(200));
    expect(await engine.positionIdsOf(alice.address)).to.deep.equal([0n]);
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(900));
    expect(await engine.totalCollateral()).to.equal(USDG(100));
    expect(await engine.engineCapital()).to.equal(USDG(500));
    expect(await engine.liquidity()).to.equal(USDG(600));
    expect((await engine.getMarket(0)).longOpenInterest).to.equal(USDG(1_000));
    expect(await engine.netExposure()).to.equal(USDG(1_000));
    await expect(engine.connect(alice).openPosition(0, true, USDG(1), 21)).to.be.revertedWithCustomError(engine, "BadLeverage");
    await expect(engine.connect(alice).openPosition(0, true, USDG(1), 0)).to.be.revertedWithCustomError(engine, "BadLeverage");
    await expect(engine.connect(alice).openPosition(1, true, USDG(1), 1)).to.be.revertedWithCustomError(engine, "UnknownMarket");
    await expect(engine.connect(alice).openPosition(0, true, 0, 1)).to.be.revertedWithCustomError(engine, "ZeroAmount");
  });

  it("pays profit out of engine capital and keeps losses in it", async () => {
    const { alice, bob, vault, engine, feed } = await withMarket();
    await engine.connect(alice).openPosition(0, true, USDG(100), 10); // 1000 long @200
    await engine.connect(bob).openPosition(0, false, USDG(100), 5); // 500 short @200
    await feed.setAnswer(PRICE(210)); // +5%
    expect(await engine.getPnL(0)).to.equal(USDG(50));
    expect(await engine.getPnL(1)).to.equal(-USDG(25));
    expect(await engine.equity(1)).to.equal(USDG(75));
    await expect(engine.connect(bob).closePosition(0)).to.be.revertedWithCustomError(engine, "NotTrader");
    await engine.connect(alice).closePosition(0);
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(1_050));
    expect(await engine.engineCapital()).to.equal(USDG(450));
    await engine.connect(bob).closePosition(1);
    expect(await vault.freeBalanceOf(bob.address)).to.equal(USDG(975));
    expect(await engine.engineCapital()).to.equal(USDG(475));
    expect(await engine.totalCollateral()).to.equal(0n);
    expect((await engine.getPosition(0)).size).to.equal(0n);
    await expect(engine.connect(alice).closePosition(0)).to.be.revertedWithCustomError(engine, "PositionClosedAlready");
  });

  it("a wiped-out position returns nothing and never goes negative", async () => {
    const { alice, vault, engine, feed } = await withMarket();
    await engine.connect(alice).openPosition(0, true, USDG(100), 20); // 2000 @200
    await feed.setAnswer(PRICE(180)); // -10% -> -200 on 100 collateral
    expect(await engine.equity(0)).to.equal(-USDG(100));
    await engine.connect(alice).closePosition(0);
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(900));
    expect(await engine.engineCapital()).to.equal(USDG(600));
  });

  it("caps a profit at what the engine holds", async () => {
    const { alice, vault, engine, feed } = await withMarket();
    await engine.setCoverageBps(0); // unlimited exposure, so the capital cap is what binds
    await engine.connect(alice).openPosition(0, true, USDG(1_000), 20); // 20 000 @200
    await feed.setAnswer(PRICE(220)); // +10% -> +2000 but the engine has 500
    await engine.connect(alice).closePosition(0);
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG(1_500));
    expect(await engine.engineCapital()).to.equal(0n);
    await expect(engine.connect(alice).openPosition(0, true, USDG(1), 1)).to.be.revertedWithCustomError(engine, "InsufficientEngineCapital");
  });

  it("charges funding hourly on the heavier side, capped at 0.05%", async () => {
    const { alice, bob, engine } = await withMarket();
    await engine.connect(alice).openPosition(0, true, USDG(100), 10); // 1000 long
    await engine.connect(bob).openPosition(0, false, USDG(98), 10); // 980 short
    // imbalance (1000-980)/1980 = 1.0101% -> x 0.01 = 0.010101% per hour, under the 0.05% cap
    const rate = await engine.currentFundingRate(0);
    const imbalance = (USDG(20) * 10n ** 18n) / USDG(1_980);
    expect(rate).to.equal((imbalance * 10n ** 16n) / 10n ** 18n);
    expect(rate).to.be.lessThan(500_000_000_000_000n);
    await expect(engine.updateFunding(0)).to.be.revertedWithCustomError(engine, "TooSoon");
    await time.increase(3 * 3600 + 10);
    // 3 whole hours pending: long pays 1000 x rate x 3, short receives 980 x rate x 3
    expect(await engine.accruedFunding(0)).to.equal((USDG(1_000) * rate * 3n) / 10n ** 18n);
    expect(await engine.accruedFunding(1)).to.equal(-((USDG(980) * rate * 3n) / 10n ** 18n));
    await engine.updateFunding(0);
    expect((await engine.getMarket(0)).cumulativeFunding).to.equal(rate * 3n);
    // an all-long book hits the cap
    await engine.connect(bob).closePosition(1);
    expect(await engine.currentFundingRate(0)).to.equal(500_000_000_000_000n);
    expect(await engine.getPnL(0)).to.equal(-(await engine.accruedFunding(0)));
  });

  it("liquidates below 5% maintenance, rewarding the liquidator 1%", async () => {
    const { alice, bob, vault, engine, feed } = await withMarket();
    await engine.connect(alice).openPosition(0, true, USDG(100), 10); // 1000 @200, maintenance 50
    expect(await engine.getLiquidationPrice(0)).to.equal(PRICE(190)); // 200 x (1 - (100-50)/1000)
    await feed.setAnswer(PRICE(192));
    expect(await engine.isLiquidatable(0)).to.equal(false);
    await expect(engine.connect(bob).liquidate(0)).to.be.revertedWithCustomError(engine, "StillSolvent");
    await feed.setAnswer(PRICE(189)); // pnl -55 -> equity 45 < 50
    expect(await engine.isLiquidatable(0)).to.equal(true);
    await engine.connect(bob).liquidate(0);
    expect(await vault.freeBalanceOf(bob.address)).to.equal(USDG("1000.45")); // 1% of 45
    expect(await vault.freeBalanceOf(alice.address)).to.equal(USDG("944.55"));
    expect(await engine.engineCapital()).to.equal(USDG(555));
    expect((await engine.getPosition(0)).size).to.equal(0n);
    await expect(engine.connect(bob).liquidate(0)).to.be.revertedWithCustomError(engine, "NotLiquidatable");
  });

  it("adding collateral moves the liquidation price away", async () => {
    const { alice, engine } = await withMarket();
    await engine.connect(alice).openPosition(0, false, USDG(100), 10); // 1000 short @200
    expect(await engine.getLiquidationPrice(0)).to.equal(PRICE(210));
    await engine.connect(alice).addCollateral(0, USDG(100));
    expect(await engine.getLiquidationPrice(0)).to.equal(PRICE(230));
    expect((await engine.getPosition(0)).collateral).to.equal(USDG(200));
  });

  it("enforces the open-interest cap and the capital coverage", async () => {
    const { alice, engine } = await withMarket();
    await engine.setMaxOiPerMarket(USDG(1_500));
    await engine.connect(alice).openPosition(0, true, USDG(100), 10);
    await expect(engine.connect(alice).openPosition(0, true, USDG(100), 10)).to.be.revertedWithCustomError(engine, "OpenInterestCap");
    await engine.setMaxOiPerMarket(USDG(1_000_000));
    // capital 500 covers 20% of net exposure -> 2500 max; 1000 long is booked, another 2000 long breaks it
    expect(await engine.maxNetExposure()).to.equal(USDG(2_500));
    await expect(engine.connect(alice).openPosition(0, true, USDG(200), 10)).to.be.revertedWithCustomError(engine, "InsufficientEngineCapital");
    // the other side reduces net exposure, so it is always welcome
    await engine.connect(alice).openPosition(0, false, USDG(200), 10);
    expect(await engine.netExposure()).to.equal(USDG(1_000));
  });

  it("owner can withdraw capital but never open collateral", async () => {
    const { alice, owner, vault, engine } = await withMarket();
    await engine.connect(alice).openPosition(0, true, USDG(100), 10);
    await expect(engine.withdrawLiquidity(owner.address, USDG(501))).to.be.revertedWithCustomError(engine, "InsufficientEngineCapital");
    await engine.withdrawLiquidity(owner.address, USDG(500));
    expect(await vault.freeBalanceOf(owner.address)).to.equal(USDG(1_000));
    expect(await engine.liquidity()).to.equal(USDG(100));
    await expect(engine.connect(alice).withdrawLiquidity(alice.address, 1)).to.be.revertedWithCustomError(engine, "NotOwner");
  });

  it("refuses stale oracle prints", async () => {
    const { alice, engine, feed } = await withMarket();
    await feed.setUpdatedAt((await time.latest()) - 6 * 24 * 3600);
    await expect(engine.markPrice(0)).to.be.revertedWithCustomError(engine, "StalePrice");
    await expect(engine.connect(alice).openPosition(0, true, USDG(1), 1)).to.be.revertedWithCustomError(engine, "StalePrice");
  });
});
