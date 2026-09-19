import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { PERP_MARKETS } from "../../src/config/assets";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";

/**
 * Deploys the Vault, the PredictionMarket and the PerpEngine, flags both
 * markets on the vault, adds the sixteen perp markets in catalog order and
 * (optionally) seeds the engine with capital.
 *
 *   npm run deploy:robinhood   — DEPLOYER_PRIVATE_KEY (+ FEE_RECIPIENT, ENGINE_CAPITAL) in contracts/.env
 *   npm run deploy:local       — against `npm run node` (port 8961); deploys MockUSDG and mock feeds
 *
 * The record it writes (contracts/deployments/<network>.json) holds every address
 * the site needs; copy them into .env.local as NEXT_PUBLIC_*_ADDRESS.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer: set DEPLOYER_PRIVATE_KEY in contracts/.env");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const local = network.name === "hardhat" || network.name === "localhost";
  const feeRecipient = process.env.FEE_RECIPIENT?.trim() || deployer.address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(feeRecipient)) throw new Error("FEE_RECIPIENT must be an address");

  let usdg = process.env.USDG_ADDRESS?.trim() ?? "";
  const feeds: { symbol: string; priceFeed: string }[] = [];
  if (local) {
    if (!usdg || (await ethers.provider.getCode(usdg)) === "0x") {
      const mock = await (await ethers.getContractFactory("MockUSDG")).deploy();
      await mock.waitForDeployment();
      usdg = await mock.getAddress();
      console.log(`MockUSDG at ${usdg}`);
    }
    // Local feeds start at a plausible price so the UI has something to show.
    const START: Record<string, number> = { AAPL: 335, NVDA: 222, TSLA: 364, SPY: 761, BTC: 81_445, ETH: 2_637, MSFT: 496, AMZN: 254, GOOGL: 350, META: 667, COIN: 194, MSTR: 153, AMD: 559, PLTR: 178, QQQ: 720, SPCX: 153 };
    for (const a of PERP_MARKETS) {
      const feed = await (await ethers.getContractFactory("MockAggregator")).deploy(`${a.symbol} / USD`, 8, ethers.parseUnits(String(START[a.symbol] ?? 100), 8));
      await feed.waitForDeployment();
      feeds.push({ symbol: a.symbol, priceFeed: await feed.getAddress() });
    }
  } else {
    if (!usdg) throw new Error("USDG_ADDRESS is required on a real network");
    if ((await ethers.provider.getCode(usdg)) === "0x") throw new Error(`no code at USDG ${usdg} on chain ${chainId}`);
    for (const a of PERP_MARKETS) feeds.push({ symbol: a.symbol, priceFeed: a.priceFeed });
  }

  console.log(`network ${network.name} chainId ${chainId} deployer ${deployer.address}`);
  console.log(`usdg ${usdg} feeRecipient ${feeRecipient}`);

  const vault = await (await ethers.getContractFactory("Vault")).deploy(usdg);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`Vault at ${vaultAddress}`);

  const pm = await (await ethers.getContractFactory("PredictionMarket")).deploy(vaultAddress, feeRecipient);
  await pm.waitForDeployment();
  const pmAddress = await pm.getAddress();
  console.log(`PredictionMarket at ${pmAddress}`);

  const engine = await (await ethers.getContractFactory("PerpEngine")).deploy(vaultAddress);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log(`PerpEngine at ${engineAddress}`);

  await (await vault.setMarket(pmAddress, true)).wait();
  await (await vault.setMarket(engineAddress, true)).wait();

  const perpMarkets: DeploymentRecord["perpMarkets"] = [];
  for (const f of feeds) {
    const tx = await engine.addMarket(f.priceFeed);
    await tx.wait();
    perpMarkets.push({ symbol: f.symbol, priceFeed: f.priceFeed, marketIndex: perpMarkets.length });
    console.log(`  perp ${perpMarkets.length - 1} ${f.symbol} ${f.priceFeed}`);
  }

  const capital = ethers.parseUnits(String(process.env.ENGINE_CAPITAL ?? "0"), 6);
  if (capital > 0n) {
    const token = await ethers.getContractAt("IERC20", usdg);
    await (await token.approve(vaultAddress, capital)).wait();
    await (await vault.deposit(capital)).wait();
    await (await engine.fund(capital)).wait();
    console.log(`engine funded with ${ethers.formatUnits(capital, 6)} USDG`);
  }

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    vault: vaultAddress,
    predictionMarket: pmAddress,
    perpEngine: engineAddress,
    usdg,
    feeRecipient,
    perpMarkets,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, `${local ? "local" : network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${file}`);
  console.log(`\nNEXT_PUBLIC_VAULT_ADDRESS=${vaultAddress}\nNEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=${pmAddress}\nNEXT_PUBLIC_PERP_ENGINE_ADDRESS=${engineAddress}\nNEXT_PUBLIC_USDG_ADDRESS=${usdg}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
