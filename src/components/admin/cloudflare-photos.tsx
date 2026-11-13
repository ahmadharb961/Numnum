"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { movePhotosAction } from "@/actions/admin";
import { Section } from "@/components/dashboard/page";
import { Button } from "@/components/ui/button";

/** Admin → Settings: move the photos still served by our server to Cloudflare Images, in small batches. */
export function CloudflarePhotos({ initial, configured }: { initial: { server: number; cloudflare: number }; configured: boolean }) {
  const [counts, setCounts] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        const r = await movePhotosAction();
        if (!r.ok) return setError(r.error ?? "Failed");
        const d = r.data!;
        setCounts({ server: d.remaining, cloudflare: d.cloudflare });
        if (d.error) return setError(d.error);
        if (!d.remaining || !d.moved) break; // done, or only photos without a stored copy are left
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section title="Photos on Cloudflare">
      <p className="text-sm text-ink-muted">Dish photos, logos, covers and reel covers are delivered by Cloudflare Images (close to customers) instead of this server. New photos go there automatically.</p>
      <div className="mt-3 flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-2xl font-black" data-testid="photos-cloudflare">{counts.cloudflare}</div>
          <div className="text-ink-muted">on Cloudflare</div>
        </div>
        <div>
          <div className="text-2xl font-black" data-testid="photos-server">{counts.server}</div>
          <div className="text-ink-muted">still on this server</div>
        </div>
      </div>
      {!configured && <p className="mt-3 text-sm font-medium text-amber-700">Cloudflare isn&apos;t set up on the server (CLOUDFLARE_ACCOUNT_ID and an API token).</p>}
      {error && <p className="mt-3 text-sm font-medium text-red-600" data-testid="photos-error">{error}</p>}
      {counts.server > 0 && configured && (
        <Button className="mt-4" loading={running} onClick={run} data-testid="move-photos">
          Move {counts.server} photo{counts.server === 1 ? "" : "s"} to Cloudflare
        </Button>
      )}
    </Section>
  );
}
