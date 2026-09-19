import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { ASSET_BY_SYMBOL } from "../../src/config/assets";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";

const ABOVE = 0;
const BELOW = 1;
const DAY = 86_400;

/**
 * The opening slate of prediction markets. Price markets resolve themselves
 * from the feed; the ones without a feed are the owner's call.
 */
export function openingMarkets(now: number) {
  const month = now + 30 * DAY;
  const quarter = now + 90 * DAY;
  const week = now + 7 * DAY;
  const yearEnd = Math.floor(Date.UTC(new Date(now * 1000).getUTCFullYear(), 11, 31, 21) / 1000);
  const price = (question: string, symbol: string, target: number, comparator: number, at: number) => ({
    question,
    priceFeed: ASSET_BY_SYMBOL[symbol].priceFeed as string,
    targetPrice: ethers.parseUnits(String(target), 8),
    comparator,
    resolutionTime: at,
  });
  const manual = (question: string, at: number) => ({ question, priceFeed: ethers.ZeroAddress, targetPrice: 0n, comparator: ABOVE, resolutionTime: at });
  return [
    price("Will NVDA close above $250 this month?", "NVDA", 250, ABOVE, month),
    price("Will TSLA close above $400 this quarter?", "TSLA", 400, ABOVE, quarter),
    price("Will AAPL close above $350 this month?", "AAPL", 350, ABOVE, month),
    price("Will SPY finish the week above $770?", "SPY", 770, ABOVE, week),
    price("Will SPY fall below $720 this month?", "SPY", 720, BELOW, month),
    price("Will QQQ close above $740 this month?", "QQQ", 740, ABOVE, month),
    price("Will MSFT close above $525 this quarter?", "MSFT", 525, ABOVE, quarter),
    price("Will AMZN close above $270 this month?", "AMZN", 270, ABOVE, month),
    price("Will GOOGL close above $370 this month?", "GOOGL", 370, ABOVE, month),
    price("Will META close above $700 this quarter?", "META", 700, ABOVE, quarter),
    price("Will BTC break above $90,000 this month?", "BTC", 90_000, ABOVE, month),
    price("Will BTC drop below $70,000 this month?", "BTC", 70_000, BELOW, month),
    price("Will ETH break above $3,000 this month?", "ETH", 3_000, ABOVE, month),
    price("Will COIN close above $220 this quarter?", "COIN", 220, ABOVE, quarter),
    price("Will MSTR close above $180 this quarter?", "MSTR", 180, ABOVE, quarter),
    price("Will AMD close above $600 this month?", "AMD", 600, ABOVE, month),
    price("Will PLTR close above $200 this quarter?", "PLTR", 200, ABOVE, quarter),
    price("Will SPCX trade above $170 before the year ends?", "SPCX", 170, ABOVE, yearEnd),
    price("Will GME squeeze above $25 this month?", "GME", 25, ABOVE, month),
    price("Will CRCL close above $110 this quarter?", "CRCL", 110, ABOVE, quarter),
    price("Will RKLB close above $80 this quarter?", "RKLB", 80, ABOVE, quarter),
    price("Will TSM close above $300 this quarter?", "TSM", 300, ABOVE, quarter),
    manual("Will SpaceX announce an IPO date before 2027?", yearEnd),
    manual("Will Robinhood Chain list a new Stock Token before 2027?", yearEnd),
    manual("Will Robinhood Chain total value locked pass $1B this quarter?", quarter),
  ];
}

async function main() {
  const local = network.name === "hardhat" || network.name === "localhost";
  const file = path.join(deploymentsDir, `${local ? "local" : network.name}.json`);
  const address =
    process.env.PREDICTION_MARKET_ADDRESS?.trim() ||
    (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as DeploymentRecord).predictionMarket : "");
  if (!address) throw new Error(`no deployment record at ${file}; set PREDICTION_MARKET_ADDRESS`);
  const pm = await ethers.getContractAt("PredictionMarket", address);
  const now = Number((await ethers.provider.getBlock("latest"))!.timestamp);
  const existing = Number(await pm.marketCount());
  console.log(`PredictionMarket ${address} on ${network.name}: ${existing} markets, seeding ${openingMarkets(now).length}`);
  for (const m of openingMarkets(now)) {
    const tx = await pm.createMarket(m.question, m.priceFeed, m.targetPrice, m.comparator, m.resolutionTime);
    await tx.wait();
    console.log(`  + ${m.question}`);
  }
  console.log(`done: ${await pm.marketCount()} markets`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
