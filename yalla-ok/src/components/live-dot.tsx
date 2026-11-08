export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 ${className}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-live-ping rounded-full bg-brand-500" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
    </span>
  );
}
