import { LogoMark } from "@/components/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <LogoMark className="h-16 w-16" />
      <h1 className="mt-5 text-2xl font-extrabold">You’re offline</h1>
      <p className="mt-2 text-ink-muted">Live tasks need a connection. We’ll be right here when you’re back.</p>
    </div>
  );
}
