/**
 * The HUNCH mark: a viewfinder — four corner brackets locked on a dot that
 * sits just up and to the right of centre. You called it before it moved.
 */
export function Mark({ size = 28, className = "", color = "var(--color-accent)", ink = "currentColor" }: { size?: number; className?: string; color?: string; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M3 11V3h8M21 3h8v8M29 21v8h-8M11 29H3v-8" stroke={ink} strokeWidth="2.6" strokeLinecap="square" />
      <circle cx="18.5" cy="13.5" r="5.5" fill={color} />
    </svg>
  );
}

export function Wordmark({ size = 24, className = "", inkClass = "text-ink" }: { size?: number; className?: string; inkClass?: string }) {
  return (
    <span className={`inline-flex items-center gap-8 ${className}`}>
      <Mark size={size + 6} className={inkClass} />
      <span className={`font-poster leading-none font-extrabold lowercase tracking-[-0.03em] ${inkClass}`} style={{ fontSize: size }}>
        hunch
      </span>
    </span>
  );
}
