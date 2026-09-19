import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";
import { openingMarkets } from "./seed-markets";

/**
 * Against `npm run node`: mints mock USDG to the first hardhat accounts,
 * funds the engine, creates the opening markets and places a few bets and
 * positions so every page has something to show.
 */
async function main() {
  const file = path.join(deploymentsDir, "local.json");
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as DeploymentRecord;
  const [owner, alice, bob] = await ethers.getSigners();
  const usdg = await ethers.getContractAt("MockUSDG", rec.usdg);
  const vault = await ethers.getContractAt("Vault", rec.vault);
  const pm = await ethers.getContractAt("PredictionMarket", rec.predictionMarket);
  const engine = await ethers.getContractAt("PerpEngine", rec.perpEngine);
  const U = (n: number) => ethers.parseUnits(String(n), 6);

  for (const who of [owner, alice, bob]) {
    await (await usdg.mint(who.address, U(100_000))).wait();
    await (await usdg.connect(who).approve(rec.vault, ethers.MaxUint256)).wait();
    await (await vault.connect(who).deposit(U(20_000))).wait();
  }
  await (await engine.fund(U(10_000))).wait();

  const now = Number((await ethers.provider.getBlock("latest"))!.timestamp);
  if (Number(await pm.marketCount()) === 0) {
    for (const m of openingMarkets(now)) await (await pm.createMarket(m.question, m.priceFeed, m.targetPrice, m.comparator, m.resolutionTime)).wait();
  }
  await (await pm.connect(alice).bet(0, true, U(120))).wait();
  await (await pm.connect(bob).bet(0, false, U(80))).wait();
  await (await pm.connect(alice).bet(10, true, U(300))).wait();
  await (await pm.connect(bob).bet(10, false, U(450))).wait();
  await (await pm.connect(bob).bet(3, false, U(60))).wait();
  await (await engine.connect(alice).openPosition(0, true, U(250), 10)).wait();
  await (await engine.connect(bob).openPosition(1, false, U(100), 5)).wait();
  await (await engine.connect(alice).openPosition(4, true, U(500), 3)).wait();
  console.log(
    `seeded: ${await pm.marketCount()} markets, ${await engine.positionCount()} positions, engine capital ${ethers.formatUnits(await engine.engineCapital(), 6)} USDG`,
  );
  console.log(`accounts: owner ${owner.address}, alice ${alice.address}, bob ${bob.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
