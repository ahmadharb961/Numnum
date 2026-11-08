import Link from "next/link";

/** Yellow speech bubble with a purple tick and motion lines. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g stroke="#ffd43b" strokeWidth="4" strokeLinecap="round">
        <path d="M3 25h7" />
        <path d="M1 33h8" />
        <path d="M5 41h5" />
      </g>
      <path
        d="M24 8h26c6.6 0 12 5.4 12 12v18c0 6.6-5.4 12-12 12H33l-11 9c-1.3 1.1-3.3.1-3.2-1.6l.6-7.7C15.3 48.5 12 44.5 12 39.6V20c0-6.6 5.4-12 12-12z"
        fill="#ffd43b"
      />
      <path d="M25 29.5l7 7 13.5-13.5" fill="none" stroke="#8125e8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ name = "Yalla Ok", href = "/" }: { name?: string; href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2 rounded-xl focus-visible:outline-none" aria-label={`${name} home`}>
      <LogoMark className="h-9 w-9 transition-transform group-hover:-rotate-6" />
      <span className="text-[1.35rem] font-extrabold tracking-tight text-ink">{name}</span>
    </Link>
  );
}
