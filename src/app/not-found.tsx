import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-6 text-center">
      <div>
        <div className="text-6xl">🍽️</div>
        <h1 className="mt-4 text-2xl font-black">This plate is empty</h1>
        <p className="mt-1 text-ink-muted">The page you&apos;re looking for doesn&apos;t exist or was removed.</p>
        <Link href="/" className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand-500 px-5 font-semibold text-white">
          Back to reels
        </Link>
      </div>
    </main>
  );
}
