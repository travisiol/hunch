// Full-page captures of every route with headless Chrome (WebGL-free pages, so no GPU flags needed).
//   node scripts/capture.mjs [baseUrl]   -> captures/<route>.png
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3961";
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find(existsSync);
if (!chrome) throw new Error("Chrome not found");
const out = resolve("captures");
mkdirSync(out, { recursive: true });

const routes = [
  ["landing", "/", 1440, 4600],
  ["landing-mobile", "/", 390, 5200],
  ["predict", "/app/predict", 1440, 1800],
  ["predict-0", "/app/predict/0", 1440, 1200],
  ["perps", "/app/perps", 1440, 1700],
  ["perp-aapl", "/app/perps/AAPL", 1440, 1500],
  ["portfolio", "/app/portfolio", 1440, 900],
  ["deposit", "/app/deposit", 1440, 1000],
  ["docs", "/docs", 1440, 3600],
];

for (const [name, path, w, h] of routes) {
  const file = resolve(out, `${name}.png`);
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${w},${h}`, "--virtual-time-budget=9000", `--screenshot=${file}`, `${base}${path}`], { stdio: "ignore" });
  console.log(`${name} -> ${file}`);
}
