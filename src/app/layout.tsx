import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope, Unbounded } from "next/font/google";
import { Providers } from "@/components/Providers";
import { brand } from "@/config/brand";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", weight: ["400", "500", "600", "700", "800"], display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", weight: ["700", "800", "900"], display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500", "600"], display: "swap" });

const TITLE = `${brand.name} — ${brand.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: TITLE, template: `%s | ${brand.name}` },
  description: brand.description,
  openGraph: { title: TITLE, description: brand.description, siteName: brand.name, type: "website", locale: "en_US" },
  twitter: { card: "summary", site: brand.x.handle, title: TITLE, description: brand.description },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0f0e0b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${unbounded.variable} ${plexMono.variable}`}>
      <body className="min-h-svh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
