# HUNCH — Call it. Get paid.

Prediction markets and perpetual futures on Robinhood Chain assets, sharing one USDG balance. Stocks, ETFs, private companies and crypto. Open 24/7, priced by Chainlink, settled onchain.

Two instruments, one vault:

- **Predict** — yes/no markets with a deadline. Parimutuel: winners get their stake back and split the losing pool pro rata; a 2% fee comes off the losing pool only. Price markets resolve themselves from the Chainlink feed; questions without a feed are the admin's call.
- **Perps** — leveraged long/short (1–20x) filled at the oracle price, no orderbook, no expiry. Hourly funding on the heavier side, capped at 0.05%. Liquidation below 5% maintenance, 1% to the liquidator. The engine's own capital is the counterparty.
- **Vault** — one USDG balance backs both. Only the two market contracts can move collateral, and each can only pay out of what it holds.

## Run it

```bash
npm install
npm run dev          # http://localhost:3961
```

With no `.env.local` the site runs against the **reference deployment** on Robinhood Chain — the OSSO Markets contracts, whose interface is identical to ours — so every market, price and balance is live from the first start. The docs page and the deposit page say so while that is the case.

## Contracts

`contracts/` is a Hardhat package with our implementation of the same interface: `Vault.sol`, `PredictionMarket.sol`, `PerpEngine.sol` (+ `MockUSDG`, `MockAggregator`). ABIs are re-exported to `src/lib/abi/` on every compile.

```bash
cd contracts && npm install
npm test                 # 18 tests: vault primitives, parimutuel math, funding, liquidation, capital coverage
npm run node             # local chain on :8961
npm run deploy:local     # mock USDG + mock feeds + the three contracts
npm run seed:local       # balances, engine capital, 25 markets, a few bets and positions
```

To go live: put `DEPLOYER_PRIVATE_KEY` (and optionally `FEE_RECIPIENT`, `ENGINE_CAPITAL`) in `contracts/.env`, then

```bash
npm run deploy:robinhood   # prints the four NEXT_PUBLIC_*_ADDRESS lines
npm run seed:robinhood     # the opening slate of prediction markets
```

and paste the addresses into `.env.local`. Nothing else changes.

## Layout

```
src/app            landing (/), app shell (/app/predict, /app/perps, /app/portfolio, /app/deposit), /docs
src/app/api        rpc (same-origin relay), candles/[symbol] (Chainlink round history), prices (landing live board)
src/components     ui kit, wallet dialog (wagmi 3, no RainbowKit), predict / perps / portfolio / deposit / landing
src/config         brand.ts (the name lives here), chains.ts, contracts.ts, assets.ts (33 assets, 16 perps, feeds)
contracts          Hardhat: contracts, tests, deploy & seed scripts
```

`npm run lint`, `npm run typecheck`, `npm test` (format + catalog), `npm run capture` (full-page PNGs of every route with headless Chrome).

## Status

Nothing is deployed. The site is fully functional against the reference deployment; our contracts pass their tests on Hardhat and have not been audited.
