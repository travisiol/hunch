"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { Label } from "@/components/ui";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { brand } from "@/config/brand";
import { fmtUsdg } from "@/lib/format";
import { useVaultBalance } from "@/lib/hooks";

const PRODUCT = [
  { href: "/app/predict", label: "Predict", match: "/app/predict" },
  { href: "/app/perps", label: "Perps", match: "/app/perps" },
];

const ACCOUNT = [
  { href: "/app/portfolio", label: "Portfolio" },
  { href: "/app/deposit", label: "Deposit" },
  { href: "/docs", label: "Docs" },
];

/** Header, page frame, paper footer and the phone tab bar, shared by every app page and the docs. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { free, locked } = useVaultBalance();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-24 gap-y-12 px-16 py-12 sm:px-20 sm:py-14">
          <Link href="/" prefetch={false} className="flex shrink-0 items-center gap-8" aria-label={`${brand.name} home`}>
            <Mark size={26} className="text-ink" />
            <span className="font-poster text-20 leading-none font-extrabold lowercase tracking-[-0.03em] text-ink max-[359px]:hidden">{brand.wordmark}</span>
          </Link>

          <nav className="order-last flex w-full border border-line-strong bg-panel md:order-none md:w-auto" aria-label="Product">
            {PRODUCT.map((item) => {
              const active = pathname.startsWith(item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`hn-label flex-1 px-20 py-12 text-center transition-colors md:flex-none md:py-10 ${active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <nav className="hidden gap-16 md:flex" aria-label="Account">
            {ACCOUNT.map((item) => (
              <Link key={item.href} href={item.href} className={`hn-label transition-colors ${pathname.startsWith(item.href) ? "text-accent" : "text-muted hover:text-ink"}`}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-20">
            <div className="hidden flex-col items-end lg:flex">
              <Label>Vault</Label>
              <span className="hn-num text-14 text-ink">
                {fmtUsdg(free)} <span className="text-muted">USDG</span>
              </span>
              {locked > 0n ? <span className="hn-label">{fmtUsdg(locked)} in play</span> : null}
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-16 pt-24 pb-96 sm:px-20 sm:py-32 md:pb-32">{children}</main>

      <footer className="paper px-16 pt-32 pb-96 sm:px-20 md:pb-32">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-20">
          <span className="hn-poster text-32 sm:text-40">
            Call it<span className="text-accent"> ↗ </span>get paid
          </span>
          <span className="hn-label">
            {brand.name} © {brand.year}. {brand.legal}
          </span>
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Account">
        <div className="flex items-stretch">
          <div className="flex flex-col justify-center border-r border-line px-12 py-8 max-[359px]:hidden">
            <Label>Vault</Label>
            <span className="hn-num text-12 text-ink">{fmtUsdg(free)}</span>
          </div>
          {ACCOUNT.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`hn-label flex min-h-[56px] flex-1 items-center justify-center px-4 !tracking-[0.06em] ${active ? "bg-accent text-accent-ink" : "text-muted"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
