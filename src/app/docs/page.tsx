import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Label } from "@/components/ui";
import { PERP_MARKETS } from "@/config/assets";
import { brand } from "@/config/brand";
import { CHAIN_ID, explorer } from "@/config/chains";
import { CONTRACTS, IS_REFERENCE_DEPLOYMENT, REFERENCE_DEPLOYMENT, USDG } from "@/config/contracts";

export const metadata: Metadata = {
  title: "Docs",
  description: `How ${brand.name} works: prediction markets and perpetual futures on Robinhood Chain assets, sharing one collateral balance.`,
};

const TOC = [
  ["what", `What ${brand.name} is`],
  ["vault", "One balance, two products"],
  ["predict", "Prediction markets"],
  ["perps", "Perpetual futures"],
  ["settlement", "Prices and settlement"],
  ["start", "Getting started"],
  ["contracts", "Contracts"],
  ["risk", "Risk"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-80 border-t border-line pt-32">
      <h2 className="hn-poster mb-16 text-[clamp(22px,7vw,32px)] text-ink">{title}</h2>
      <div className="flex max-w-[68ch] flex-col gap-14 text-14 leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Row({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-10 border-b border-line py-10 last:border-b-0">
      <span className="hn-label w-[180px] shrink-0">{label}</span>
      <a href={explorer.address(address)} target="_blank" rel="noreferrer" className="hn-num text-12 break-all text-ink hover:text-accent">
        {address}
      </a>
    </div>
  );
}

export default function DocsPage() {
  return (
    <AppShell>
      <header className="mb-40 flex flex-col gap-12">
        <h1 className="hn-poster text-[clamp(26px,6.4vw,56px)] text-ink">
          <span className="text-accent">[↗]</span>Docs
        </h1>
        <p className="max-w-[60ch] text-14 leading-relaxed text-muted">
          {brand.name} in one page: what it is, how each product settles, what can go wrong. Everything below is what the contracts do, not what we hope they do.
        </p>
        <nav className="mt-8 flex flex-wrap gap-x-20 gap-y-8" aria-label="Sections">
          {TOC.map(([id, title]) => (
            <a key={id} href={`#${id}`} className="hn-label hover:text-ink">
              {title}
            </a>
          ))}
        </nav>
        <div className="mt-16 flex flex-wrap gap-12">
          <Link href="/app/predict" className="hn-label border border-line-strong px-20 py-14 text-ink transition-colors hover:bg-accent hover:text-accent-ink">
            Launch app
          </Link>
          <a href={brand.x.url} target="_blank" rel="noreferrer" className="hn-label border border-line px-20 py-14 text-muted transition-colors hover:border-line-strong hover:text-ink">
            Follow on X
          </a>
        </div>
      </header>

      <div className="flex flex-col gap-40">
        <Section id="what" title={`What ${brand.name} is`}>
          <p>
            Robinhood Chain puts real assets onchain as tokens: stocks like NVDA and TSLA, ETFs like SPY and QQQ, private companies like SpaceX, and crypto.{" "}
            {brand.name} is a place to take a position on any of them, 24 hours a day, without the underlying market being open.
          </p>
          <p>
            There are two instruments. A prediction market, where you pick a side of a yes or no question and get paid if you are right. And perpetual futures,
            where you take a leveraged long or short on price. Same wallet, same balance, same settlement layer.
          </p>
        </Section>

        <Section id="vault" title="One balance, two products">
          <p>You deposit USDG once into the Vault. That single balance backs both products, so moving between a prediction and a perp never means withdrawing and redepositing.</p>
          <p>
            The vault splits your balance into <span className="text-ink">free</span> and <span className="text-ink">in play</span>. Free is withdrawable at any time. In
            play is committed to an open bet or position and comes back when it settles.
          </p>
          <p>
            Only the two market contracts can move collateral, and each can only ever pay out of what it holds. Nothing in the system can create collateral that was not
            deposited.
          </p>
        </Section>

        <Section id="predict" title="Prediction markets">
          <p>
            Every market is a yes or no question with a deadline. You stake USDG on a side. The odds you see are the pools themselves: if the YES pool is 65% of the
            total, the market is pricing that outcome at 65%.
          </p>
          <p>
            Settlement is parimutuel. Winners get their stake back and split the losing pool in proportion to what they staked. A 2% protocol fee is taken from the losing
            pool only, which means a winner is never paid less than their stake.
          </p>
          <p className="hn-num text-ink">payout = stake + (stake × losing pool × 0.98) / winning pool</p>
          <p>
            If nobody took the other side, or nobody took the winning side, everyone is refunded in full and no fee is charged. There is no leverage here, no liquidation and
            no margin call. The most you can lose is what you staked.
          </p>
        </Section>

        <Section id="perps" title="Perpetual futures">
          <p>Perps are leveraged exposure to price with no expiry. Pick a market, post USDG as collateral, choose up to 20x, and go long or short. Position size is collateral times leverage.</p>
          <p>
            <span className="text-ink">Mark price</span> comes straight from a Chainlink feed. There is no orderbook in v1, so you are always filled at the oracle price with
            no spread and no slippage.
          </p>
          <p>
            <span className="text-ink">Funding</span> is charged hourly and keeps the book balanced. The rate is the open interest imbalance over total open interest, scaled
            by 0.01 and capped at 0.05% per hour. When longs outweigh shorts, longs pay shorts.
          </p>
          <p>
            <span className="text-ink">Liquidation</span> happens when your collateral plus unrealised profit and loss falls below 5% of position size. At 10x that is roughly
            a 5% move against you. Anyone can trigger a liquidation and keeps 1% of the remaining collateral. The rest goes back to you.
          </p>
          <p>
            The engine&apos;s own capital is the counterparty, so open interest is capped per market and the engine will not accept a position that would push its net exposure
            past what that capital covers. A profit is never paid beyond what the engine holds.
          </p>
        </Section>

        <Section id="settlement" title="Prices and settlement">
          <p>
            Every price in {brand.name} comes from a Chainlink feed on Robinhood Chain, at 8 decimals. The oracle chart is not a third party price API: each point is a round
            the feed actually published, read back from the aggregator.
          </p>
          <p>
            Price based prediction markets resolve permissionlessly. Once the deadline passes, anyone can call resolve and the contract reads the feed itself. There is no
            discretion and nothing to dispute. Markets about real world events with no feed are the exception and are resolved by the admin.
          </p>
          <p>{PERP_MARKETS.length} assets currently have perp markets, and the prediction markets cover the wider Robinhood Chain asset set.</p>
        </Section>

        <Section id="start" title="Getting started">
          <p>
            You need an EVM wallet on Robinhood Chain, some ETH for gas, and USDG to trade with. {brand.name} is non custodial: you sign every transaction and your keys never
            leave your device.
          </p>
          <ol className="flex list-decimal flex-col gap-8 pl-20">
            <li>Connect a wallet. Any EVM wallet on Robinhood Chain, chain id {CHAIN_ID}.</li>
            <li>Deposit USDG on the deposit page. Approve once, then deposit.</li>
            <li>Take a side on a prediction, or open a leveraged position on a perp.</li>
            <li>Withdraw any free balance whenever you like.</li>
          </ol>
        </Section>

        <Section id="contracts" title="Contracts">
          <p>Everything is deployed on Robinhood Chain mainnet, chain id {CHAIN_ID}.</p>
          {IS_REFERENCE_DEPLOYMENT ? (
            <p className="border border-accent/40 px-16 py-12 text-13">
              <Label className="text-accent">Reference deployment</Label>
              <br />
              These are the {REFERENCE_DEPLOYMENT.name} contracts. {brand.name} ships the same interface (the ABIs are identical) with its own implementation in{" "}
              <span className="hn-num text-ink">contracts/</span>; until it is deployed, the app runs against this reference so every market, price and balance you see is
              live. Deploying moves the site by four environment variables.
            </p>
          ) : null}
          <div className="mt-8 w-full">
            <Row label="Vault" address={CONTRACTS.vault || "—"} />
            <Row label="Prediction market" address={CONTRACTS.predictionMarket || "—"} />
            <Row label="Perp engine" address={CONTRACTS.perpEngine || "—"} />
            <Row label="USDG collateral" address={USDG} />
          </div>
          <p>The vault owner can flag which contracts count as markets. Trusting the vault means trusting that key; the app shows the address so you can watch it.</p>
        </Section>

        <Section id="risk" title="Risk">
          <p>{brand.name} is new and the contracts have not been audited. Treat it accordingly and do not put in more than you are willing to lose.</p>
          <p>Positions are public onchain. Anyone can see any address and what it holds. {brand.name} makes no privacy claim of any kind.</p>
          <p>
            Perps carry the risks leverage always carries. A 5% move against a 10x position liquidates it. Funding is a running cost on the heavier side of the book. And
            because the engine&apos;s capital is the counterparty in v1, its size bounds how much open interest the engine will accept and how much profit it can pay.
          </p>
          <p>Nothing here is investment advice.</p>
        </Section>
      </div>

      <footer className="mt-48 border-t border-line pt-24">
        <div className="flex flex-wrap items-center gap-16">
          <Label>{brand.name}</Label>
          <a href={brand.x.url} target="_blank" rel="noreferrer" className="hn-label hover:text-ink">
            X
          </a>
          <Link href="/" className="hn-label hover:text-ink">
            Home
          </Link>
        </div>
      </footer>
    </AppShell>
  );
}
