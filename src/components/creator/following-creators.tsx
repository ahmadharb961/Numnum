"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, UserPlus, UserRound } from "lucide-react";
import Link from "@/components/link";
import { followCreatorAction } from "@/actions/creators";
import { useToast } from "@/components/ui/toast";
import { cn, compactNumber } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Row = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  followerCount: number;
};

/** The creators a customer follows (Account → Following): open their profile, or unfollow. */
export function FollowingCreators({
  items,
  title,
}: {
  items: Row[];
  title: string;
}) {
  const t = useT();
  const toast = useToast();
  // Unfollowed rows stay on screen with "Follow", so a mis-tap can be undone.
  // The page refreshes after a change and no longer lists who was unfollowed: keep the rows already
  // shown (with their state), and add any newly followed ones.
  const [rows, setRows] = useState(items);
  useEffect(() => {
    setRows((prev) => {
      const known = new Set(prev.map((r) => r.id));
      const added = items.filter((r) => !known.has(r.id));
      return added.length ? [...added, ...prev] : prev;
    });
  }, [items]);
  const [following, setFollowing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((c) => [c.id, true])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (c: Row) => {
    const next = following[c.id] === false;
    setBusy(c.id);
    setFollowing((f) => ({ ...f, [c.id]: next }));
    const r = await followCreatorAction(c.id, next).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setFollowing((f) => ({ ...f, [c.id]: !next }));
      toast(t("Couldn't save. Try again."), "error");
    }
  };
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="mb-2 font-extrabold">{title}</h2>
      <ul
        className="card divide-y divide-black/5 overflow-hidden"
        data-testid="following-creators"
      >
        {rows.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 p-3.5"
            data-testid="following-creator"
          >
            <Link
              href={`/c/${c.handle}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-500">
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-bold">
                  <span className="truncate">{c.name}</span>
                  {c.verified && (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-sky-500"
                      aria-label={t("Verified")}
                    />
                  )}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  <span dir="ltr">@{c.handle}</span> ·{" "}
                  {t(c.followerCount === 1 ? "{n} follower" : "{n} followers", {
                    n: compactNumber(c.followerCount),
                  })}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => toggle(c)}
              disabled={busy === c.id}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-bold transition active:scale-95",
                following[c.id] !== false
                  ? "bg-black/5 text-ink"
                  : "bg-brand-500 text-white",
              )}
              data-testid="following-creator-toggle"
            >
              {following[c.id] !== false ? (
                <Check className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {t(following[c.id] !== false ? "Following" : "Follow")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
