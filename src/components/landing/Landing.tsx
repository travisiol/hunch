"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { Bracket, Label } from "@/components/ui";
import { brand } from "@/config/brand";
import { countdown, fmtPrice, fmtUsdg, impliedOdds } from "@/lib/format";
import { useNow } from "@/lib/hooks";

type Live = {
  at: number;
  prices: { symbol: string; name: string; price: string | null; updatedAt: number | null }[];
  openInterest: string;
  marketCount: number;
  market: { id: number; question: string; yesPool: string; noPool: string; resolutionTime: number } | null;
};

/** Everything the landing shows live, refreshed every 20 s. Null until the first answer. */
function useLive(): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/prices");
        if (!res.ok) return;
        const json = (await res.json()) as Live;
        if (!cancelled) setLive(json);
      } catch {
        /* the tape simply stays quiet */
      }
    };
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return live;
}

/** Types the headline once, then leaves the caret blinking. */
function Typed({ text, speed = 38, className = "" }: { text: string; speed?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    // With reduced motion the first tick shows the whole line; otherwise one character per tick.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    const timer = setInterval(
      () => {
        i = reduced ? text.length : i + 1;
        setN(i);
        if (i >= text.length) clearInterval(timer);
      },
      reduced ? 0 : speed,
    );
    return () => clearInterval(timer);
  }, [text, speed]);
  return (
    <span className={`${className} ${n >= text.length ? "caret" : ""}`} aria-label={text}>
      {text.slice(0, n)}
      <span className="invisible" aria-hidden="true">
        {text.slice(n)}
      </span>
    </span>
  );
}

function Tape({ live }: { live: Live | null }) {
  const items = useMemo(() => (live?.prices ?? []).filter((p) => p.price), [live]);
  if (items.length === 0) {
    return (
      <div className="border-y border-line px-16 py-12">
        <Label>Chainlink · Robinhood Chain · reading the feeds</Label>
      </div>
    );
  }
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-line" aria-label="Live oracle prices">
      <div className="tape">
        {row.map((p, i) => (
          <Link key={`${p.symbol}-${i}`} href={`/app/perps/${p.symbol}`} className="flex shrink-0 items-baseline gap-10 border-r border-line px-20 py-12 hover:bg-panel">
            <span className="hn-poster text-14 text-ink">{p.symbol}</span>
            <span className="hn-num text-14 text-accent">{fmtPrice(BigInt(p.price!))}</span>
            <span className="hn-label">{p.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The product itself, live: a perp, a prediction, the vault. */
function Board({ live }: { live: Live | null }) {
  const now = useNow();
  const aapl = live?.prices.find((p) => p.symbol === "AAPL") ?? null;
  const btc = live?.prices.find((p) => p.symbol === "BTC") ?? null;
  const m = live?.market ?? null;
  const odds = m ? impliedOdds(BigInt(m.yesPool), BigInt(m.noPool)) : null;
  return (
    <div className="flex flex-col gap-12">
      <div className="hn-frame border border-line bg-panel p-18">
        <div className="flex items-center justify-between">
          <Label>Perp · Chainlink mark</Label>
          <Label className="text-accent">20x</Label>
        </div>
        <div className="mt-12 flex items-end justify-between gap-12">
          <div className="min-w-0">
            <div className="hn-poster text-20 whitespace-nowrap text-ink sm:text-24">AAPL-PERP</div>
            <div className="hn-label mt-4">Apple</div>
          </div>
          <div className="hn-num text-24 leading-none whitespace-nowrap text-ink sm:text-32">{aapl?.price ? fmtPrice(BigInt(aapl.price)) : "—"}</div>
        </div>
        <div className="mt-12 flex items-end justify-between gap-12 border-t border-line pt-12">
          <div className="min-w-0">
            <div className="hn-poster text-20 whitespace-nowrap text-ink sm:text-24">BTC-PERP</div>
            <div className="hn-label mt-4">Bitcoin</div>
          </div>
          <div className="hn-num text-24 leading-none whitespace-nowrap text-ink sm:text-32">{btc?.price ? fmtPrice(BigInt(btc.price)) : "—"}</div>
        </div>
      </div>
      <div className="hn-frame border border-line bg-panel p-18">
        <div className="flex items-center justify-between">
          <Label>Prediction · parimutuel</Label>
          <Label className="text-accent">{m && now ? countdown(m.resolutionTime, now) : "—"}</Label>
        </div>
        <p className="mt-10 text-18 leading-tight font-bold text-ink">{m?.question ?? "Reading the markets"}</p>
        <div className="mt-14 flex h-24 w-full overflow-hidden border border-line">
          <span className="bg-yes" style={{ width: `${odds?.yes ?? 50}%` }} />
          <span className="bg-no" style={{ width: `${odds?.no ?? 50}%` }} />
        </div>
        <div className="mt-8 flex justify-between">
          <span className="hn-poster text-16 text-yes">Yes {odds ? odds.yes.toFixed(0) : "–"}</span>
          <span className="hn-poster text-16 text-no">No {odds ? odds.no.toFixed(0) : "–"}</span>
        </div>
      </div>
      <div className="flex items-center justify-between border border-line bg-panel px-18 py-12">
        <Label>Open interest · every perp</Label>
        <span className="hn-num text-14 text-ink">{live ? fmtUsdg(BigInt(live.openInterest)) : "—"} USDG</span>
      </div>
    </div>
  );
}

export function Landing() {
  const live = useLive();

  return (
    <div className="min-h-svh">
      {/* Bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-12 px-16 py-12 sm:px-24">
          <Link href="/" className="flex items-center gap-8" aria-label={`${brand.name} home`}>
            <Mark size={30} className="text-ink" />
            <span className="font-poster text-24 leading-none font-extrabold lowercase tracking-[-0.03em] text-ink">{brand.wordmark}</span>
          </Link>
          <nav className="hidden items-center gap-24 md:flex" aria-label="Site">
            <Link href="/app/predict" className="hn-label hover:text-ink">
              Predict
            </Link>
            <Link href="/app/perps" className="hn-label hover:text-ink">
              Perps
            </Link>
            <Link href="/docs" className="hn-label hover:text-ink">
              Docs
            </Link>
          </nav>
          <Bracket href="/app/predict" variant="solid" className="!py-10 !px-16 text-14">
            Launch app
          </Bracket>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1400px] gap-40 px-16 pt-48 pb-56 sm:px-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:pt-72 lg:pb-80">
        <div>
          <Label className="text-accent">[↗] Robinhood Chain · Chainlink · USDG</Label>
          <h1 className="mt-20 text-[clamp(30px,5.2vw,64px)] leading-[1.02] font-medium tracking-[-0.02em] text-ink">
            <Typed text="Every price was a hunch first." />
          </h1>
          <p className="hn-poster mt-20 text-[clamp(44px,9.5vw,136px)] text-ink">
            Call it.
            <br />
            <span className="text-accent">Get paid.</span>
          </p>
          <p className="mt-24 max-w-[52ch] text-16 leading-relaxed text-muted sm:text-18">
            Prediction markets and perpetual futures on Robinhood Chain assets. One USDG balance backs both. Open 24/7, settled onchain, priced by Chainlink.
          </p>
          <div className="mt-32 flex flex-wrap gap-16">
            <Bracket href="/app/predict" variant="solid">
              Predict <span aria-hidden="true">↗</span>
            </Bracket>
            <Bracket href="/app/perps">
              Trade perps <span aria-hidden="true">↗</span>
            </Bracket>
          </div>
        </div>
        <div className="reveal">
          <Board live={live} />
        </div>
      </section>

      <Tape live={live} />

      {/* Statement */}
      <section className="bg-accent text-accent-ink">
        <div className="mx-auto max-w-[1400px] px-16 py-64 sm:px-24 lg:py-96">
          <p className="reveal text-20 font-medium sm:text-24">A hunch is worth nothing</p>
          <p className="reveal hn-poster mt-12 text-[clamp(40px,9vw,128px)]">
            until it&apos;s
            <br />
            on the line
          </p>
          <div className="reveal mt-40 grid gap-24 border-t border-accent-ink/25 pt-24 sm:grid-cols-3">
            <p className="text-16 leading-relaxed">You know where NVDA closes. You know BTC does not hold. Knowing pays nothing.</p>
            <p className="text-16 leading-relaxed">Markets are closed sixteen hours a day and all weekend. Your hunch is not.</p>
            <p className="text-16 leading-relaxed">So we built a place where it settles onchain, the second the oracle prints.</p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-[1400px] px-16 py-64 sm:px-24 lg:py-96">
        <div className="reveal flex items-center gap-12">
          <span className="hn-poster text-24 text-ink">{brand.name}</span>
          <span className="text-24 text-muted">lets you</span>
        </div>
        <ol className="mt-32 grid gap-32 lg:grid-cols-3">
          {[
            ["Predict where it goes", "Yes or no markets on stocks, ETFs, private companies and crypto. Parimutuel payouts, resolved by Chainlink, 2% off the losing pool only.", "/app/predict"],
            ["Trade it with up to 20x", "Perpetual futures priced straight from the oracle. No orderbook, no slippage, no expiry. Funding every hour, capped at 0.05%.", "/app/perps"],
            ["Back it all with one balance", "Deposit USDG once. The same balance covers every bet and every position, and comes back the moment it settles.", "/app/deposit"],
          ].map(([title, body, href], i) => (
            <li key={title} className="reveal hn-frame border border-line bg-panel p-24">
              <span className="hn-label text-accent">[{i + 1}]</span>
              <h2 className="hn-poster mt-16 text-[clamp(28px,4vw,44px)] text-ink">{title}</h2>
              <p className="mt-16 text-15 leading-relaxed text-muted">{body}</p>
              <Link href={href} className="hn-label mt-20 inline-block text-accent hover:text-ink">
                Open ↗
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Facts */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 lg:grid-cols-4">
          {[
            ["24/7", "Markets never close"],
            ["20x", "Max perp leverage"],
            ["2%", "Fee, from the losing pool only"],
            ["0", "Keys we ever see"],
          ].map(([big, small], i) => (
            <div key={big} className={`reveal px-16 py-28 sm:px-24 ${i % 2 === 0 ? "border-r border-line" : ""} ${i < 2 ? "border-b border-line lg:border-b-0" : ""} ${i === 1 ? "lg:border-r" : ""} ${i === 2 ? "lg:border-r" : ""}`}>
              <div className="hn-poster text-[clamp(36px,6vw,72px)] text-ink">{big}</div>
              <div className="hn-label mt-8">{small}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Ticket */}
      <section className="paper">
        <div className="mx-auto max-w-[1400px] px-16 py-64 sm:px-24 lg:py-96">
          <div className="reveal flex flex-wrap items-end justify-between gap-16">
            <p className="hn-poster text-[clamp(36px,7vw,96px)]">
              Two ways
              <br />
              <span className="text-accent">↗↗↗</span> to be right
            </p>
            <div className="hn-label max-w-[36ch] text-right">Stocks, ETFs, private companies and crypto. Open 24/7, and every position is public.</div>
          </div>
          <div className="reveal mt-40 grid gap-0 border border-accent-ink bg-[#fbf8f1] lg:grid-cols-[1fr_360px]">
            <div className="p-24 sm:p-32">
              <h2 className="text-[clamp(26px,4vw,40px)] leading-[1.05] font-bold tracking-[-0.02em]">Bet on it, or trade it. Same balance.</h2>
              <p className="mt-16 max-w-[60ch] text-16 leading-relaxed text-[#4c4638]">
                Bet on where Apple, NVIDIA, Tesla, SpaceX or Bitcoin will be. Or trade perpetual futures on them with up to 20x leverage. One USDG balance backs both, on
                Robinhood Chain. Non-custodial: you sign everything, we never see a key.
              </p>
              <ul className="mt-20 flex flex-col gap-8 text-15">
                {["Parimutuel prediction markets, resolved by Chainlink", "Perps priced by Chainlink, 5% maintenance margin", "2% fee comes off the losing pool only"].map((t) => (
                  <li key={t} className="flex items-start gap-10">
                    <span className="mt-6 h-8 w-8 shrink-0 bg-accent" aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-28 flex flex-wrap gap-16">
                <Bracket href="/app/predict" variant="solid">
                  Predict ↗
                </Bracket>
                <Bracket href="/app/perps" variant="paper">
                  Trade perps ↗
                </Bracket>
                <Bracket href="/app/deposit" variant="paper">
                  Deposit USDG
                </Bracket>
              </div>
            </div>
            <div className="relative flex min-h-[220px] items-center justify-center border-t border-dashed border-accent-ink bg-accent lg:border-t-0 lg:border-l">
              <Mark size={140} color="#14110a" ink="#14110a" />
              <span className="absolute right-16 bottom-14 hn-label !text-accent-ink/70">Admit one hunch</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-[1400px] px-16 py-40 sm:px-24">
        <div className="flex flex-wrap items-center justify-center gap-12">
          <Bracket href="/app/portfolio">Portfolio</Bracket>
          <Bracket href="/docs">Docs</Bracket>
          <Bracket href={brand.x.url} external>
            X (Twitter)
          </Bracket>
        </div>
        <p className="hn-label mt-24 text-center">
          {brand.name} — {brand.tagline} © {brand.year}. {brand.legal}
        </p>
      </footer>
    </div>
  );
}
