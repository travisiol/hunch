import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`hn-label ${className}`}>{children}</span>;
}

const TONES = {
  default: "border-line-strong text-ink hover:bg-accent hover:border-accent hover:text-accent-ink",
  ghost: "border-line text-muted hover:text-ink hover:border-line-strong",
  yes: "border-yes/40 text-yes hover:bg-yes hover:border-yes hover:text-bg",
  no: "border-no/40 text-no hover:bg-no hover:border-no hover:text-bg",
  long: "border-long/40 text-long hover:bg-long hover:border-long hover:text-bg",
  short: "border-short/40 text-short hover:bg-short hover:border-short hover:text-bg",
} as const;

export type Tone = keyof typeof TONES;

export function Button({
  children,
  tone = "default",
  active = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`hn-label border px-16 py-12 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-accent border-accent text-accent-ink" : TONES[tone]
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  return <Tag className={`hn-frame border border-line bg-panel ${className}`}>{children}</Tag>;
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border-b border-line px-20 py-14 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-20 py-16 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-line px-20 py-40 text-center">
      <Label>{children}</Label>
    </div>
  );
}

export function Field({ label, suffix, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; suffix?: ReactNode }) {
  return (
    <label className="flex flex-col gap-8">
      <Label>{label}</Label>
      <span className="hn-frame flex items-center border border-line bg-bg px-14 py-12">
        <input {...rest} className="hn-num w-full bg-transparent text-16 text-ink outline-none placeholder:text-muted" />
        {suffix ? <span className="hn-label ml-8 shrink-0">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function PageHeading({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-28 flex flex-col gap-12">
      <h1 className="hn-poster text-[clamp(26px,6.4vw,56px)] text-ink">
        <span className="text-accent">[↗]</span>
        {title}
      </h1>
      {sub ? <p className="max-w-[60ch] text-14 leading-relaxed text-muted">{sub}</p> : null}
    </header>
  );
}

export function Stat({ label, value, tone = "default", sub }: { label: ReactNode; value: ReactNode; tone?: "default" | "up" | "down"; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <Label>{label}</Label>
      <span className={`hn-num text-16 ${tone === "up" ? "text-long" : tone === "down" ? "text-short" : "text-ink"}`}>{value}</span>
      {sub ? <span className="hn-label">{sub}</span> : null}
    </div>
  );
}

/** The landing's four-bracket button. `solid` is amber, `paper` is for the paper section. */
export function Bracket({
  children,
  href,
  variant = "outline",
  className = "",
  external = false,
}: {
  children: ReactNode;
  href: string;
  variant?: "outline" | "solid" | "paper";
  className?: string;
  external?: boolean;
}) {
  const cls = `hn-bracket ${variant === "solid" ? "hn-bracket--solid" : variant === "paper" ? "hn-bracket--paper" : ""} ${className}`;
  return (
    <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <i />
      <i />
      <i />
      <i />
      {children}
    </a>
  );
}
