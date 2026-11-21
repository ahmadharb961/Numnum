"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { Loader2, Users } from "lucide-react";
import type { GroupState } from "@/server/group-carts";
import { useCart } from "./cart";
import { groupApi, setGroup, type GroupApiError } from "./group-store";
import { Button } from "@/components/ui/button";
import { EmptyState, Field } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { prefetchPage } from "@/lib/prefetch";
import { useT } from "@/i18n/client";

const NAME_KEY = "nn_group_name";
const sum = (lines: GroupState["members"][number]["lines"]) => lines.reduce((s, l) => s + Math.max(0, l.unitBaseCents + l.unitOptionsCents) * l.quantity, 0);

export function JoinGroup({ code, initial, accountName }: { code: string; initial: GroupState | null; accountName: string | null }) {
  const t = useT();
  const router = useRouter();
  const { cart, replaceWith } = useCart();
  const [state, setState] = useState(initial);
  const [name, setName] = useState(accountName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (accountName) return;
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {}
  }, [accountName]);
  // The menu opens instantly after joining.
  useEffect(() => {
    if (state) prefetchPage(router, `/r/${state.restaurant.slug}`);
  }, [state, router]);

  if (!state) return <EmptyState icon={<Users />} title={t("This group order link isn't valid")} body={t("Ask your friend to send the link again.")} action={<Link href="/" className="chip chip-active">{t("Watch reels")}</Link>} />;
  const me = state.members.find((m) => m.isMe);
  const enter = (s: GroupState) => {
    const mine = s.members.find((m) => m.isMe)?.lines ?? [];
    setGroup({ code: s.code, restaurantId: s.restaurant.id, isHost: s.isHost, mode: "open" });
    // My cart becomes my share of the group (from the group, so a second phone or a return visit sees it).
    replaceWith({ id: s.restaurant.id, name: s.restaurant.name, slug: s.restaurant.slug, currency: s.restaurant.currency }, mine);
  };

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const s = await groupApi(code, { action: "join", name: name.trim() });
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {}
      setState(s);
      enter(s);
      router.push(`/r/${s.restaurant.slug}`);
    } catch (e) {
      setError((e as GroupApiError).message);
      setBusy(false);
    }
  }

  const closed = state.status === "ORDERED" || state.status === "CANCELED" || state.status === "EXPIRED";
  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3 p-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-brand-50">
          {state.restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.restaurant.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-2xl">🍽️</div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-black leading-tight" data-testid="group-title">{t("{host}'s group order", { host: state.hostName })}</h1>
          <p className="text-sm text-ink-muted">{t("from {restaurant} · cash on delivery", { restaurant: state.restaurant.name })}</p>
        </div>
      </div>

      {closed ? (
        <div className="card p-5 text-center" data-testid="group-closed">
          <div className="text-4xl">{state.status === "ORDERED" ? "🎉" : "⌛"}</div>
          <p className="mt-2 font-bold">{state.status === "ORDERED" ? t("{host} already placed this order", { host: state.hostName }) : t("This group order has ended")}</p>
          <Link href={`/r/${state.restaurant.slug}`} className="mt-3 inline-block font-semibold text-brand-600">{t("See the menu")}</Link>
        </div>
      ) : (
        <>
          <section className="card divide-y divide-black/5">
            <div className="px-4 py-3 text-sm font-bold">{t(state.members.length === 1 ? "1 person in this order" : "{n} people in this order", { n: state.members.length })}</div>
            {state.members.map((m) => (
              <div key={m.id} className="px-4 py-2.5 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>
                    {m.name}
                    {m.isHost ? ` (${t("host")})` : ""}
                    {m.isMe ? ` · ${t("you")}` : ""}
                  </span>
                  <span className="tabular">{formatMoney(sum(m.lines), state.restaurant.currency)}</span>
                </div>
                <div className="text-ink-muted">{m.lines.length ? m.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ") : t("Choosing…")}</div>
              </div>
            ))}
          </section>

          {me ? (
            <div className="space-y-2">
              <Button size="lg" block onClick={() => { enter(state); router.push(`/r/${state.restaurant.slug}`); }} data-testid="group-continue">
                {t("Add my meal from {name}", { name: state.restaurant.name })}
              </Button>
              <Button size="lg" block variant="outline" onClick={() => { enter(state); router.push("/cart"); }}>
                {t("See the group order")}
              </Button>
            </div>
          ) : state.status === "LOCKED" ? (
            <p className="card p-4 text-center text-sm">{t("{host} is placing the order now. Ask them to reopen it to add your meal.", { host: state.hostName })}</p>
          ) : (
            <div className="card space-y-3 p-4">
              <Field label={t("Your name")} htmlFor="join-name" error={error ?? undefined}>
                <input id="join-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("So everyone knows which meal is yours")} />
              </Field>
              {cart && cart.lines.length > 0 && <p className="text-xs text-ink-muted">{t("Your current cart will be replaced by your items in this group order.")}</p>}
              <Button size="lg" block onClick={join} disabled={busy || !name.trim()} data-testid="group-join">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />} {t("Join and add my meal")}
              </Button>
              <p className="text-center text-xs text-ink-muted">{t("No account needed. {host} places the order and pays cash on delivery.", { host: state.hostName })}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
